package network

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// DetectGateway detects the C2 host IP address
func DetectGateway() (string, error) {
	// Try to find Host-Only network first (common in VirtualBox/VMware)
	// These typically use 192.168.56.x or 192.168.57.x ranges
	if runtime.GOOS == "linux" {
		cmd := exec.Command("sh", "-c", "ip addr show | grep 'inet ' | awk '{print $2}' | cut -d/ -f1")
		output, err := cmd.Output()
		if err == nil {
			ips := strings.Split(strings.TrimSpace(string(output)), "\n")
			for _, ip := range ips {
				ip = strings.TrimSpace(ip)
				// Skip loopback and common NAT ranges
				if ip == "127.0.0.1" || strings.HasPrefix(ip, "10.0.2.") {
					continue
				}
				// Prefer 192.168.x.x ranges (common for Host-Only)
				if strings.HasPrefix(ip, "192.168.") {
					parts := strings.Split(ip, ".")
					if len(parts) == 4 {
						hostIP := parts[0] + "." + parts[1] + "." + parts[2] + ".1"
						log.Printf("Found Host-Only network interface with IP %s, testing host at %s...", ip, hostIP)
						if TestHostReachable(hostIP) {
							return hostIP, nil
						}
					}
				}
			}
		}
	}
	
	// Fallback to default gateway detection
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "route print 0.0.0.0")
	} else {
		cmd = exec.Command("sh", "-c", "ip route | grep default | awk '{print $3}' | head -n1")
	}
	
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	
	gateway := strings.TrimSpace(string(output))
	
	// For Windows, parse the route print output
	if runtime.GOOS == "windows" {
		lines := strings.Split(gateway, "\n")
		for _, line := range lines {
			if strings.Contains(line, "0.0.0.0") {
				fields := strings.Fields(line)
				if len(fields) >= 3 {
					gateway = fields[2]
					break
				}
			}
		}
	}
	
	// For VM environments, try .1 first (common host machine IP)
	if strings.Contains(gateway, ".") {
		parts := strings.Split(gateway, ".")
		if len(parts) == 4 {
			hostIP := parts[0] + "." + parts[1] + "." + parts[2] + ".1"
			log.Printf("Testing host IP %s...", hostIP)
			if TestHostReachable(hostIP) {
				log.Printf("Host IP %s is reachable, using it", hostIP)
				return hostIP, nil
			}
			log.Printf("Host IP %s not reachable, using gateway %s", hostIP, gateway)
		}
	}
	
	return gateway, nil
}

// TestHostReachable tests if a host IP is reachable on port 443
func TestHostReachable(hostIP string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	
	client := &http.Client{
		Timeout: 2 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
	
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://"+hostIP+":443", nil)
	_, testErr := client.Do(req)
	
	return testErr == nil || strings.Contains(testErr.Error(), "certificate") || strings.Contains(testErr.Error(), "handshake")
}

// SetupHosts adds entries to the hosts file for C2 domains
func SetupHosts(gateway string) error {
	var hostsPath string
	if runtime.GOOS == "windows" {
		hostsPath = "C:\\Windows\\System32\\drivers\\etc\\hosts"
	} else {
		hostsPath = "/etc/hosts"
	}
	
	// Read current hosts file
	content, err := os.ReadFile(hostsPath)
	if err != nil {
		return fmt.Errorf("failed to read hosts file: %v", err)
	}
	
	// Remove any existing Gla1v3 entries (including old/stale ones)
	lines := strings.Split(string(content), "\n")
	var cleanedLines []string
	skipNext := false
	
	for _, line := range lines {
		if strings.Contains(line, "# Gla1v3 C2") {
			skipNext = true
			continue
		}
		if skipNext && (strings.Contains(line, "gla1v3.local")) {
			continue
		}
		// Also remove any standalone gla1v3.local entries without comment
		if strings.Contains(line, "gla1v3.local") {
			continue
		}
		skipNext = false
		cleanedLines = append(cleanedLines, line)
	}
	
	// Add fresh entries with current gateway
	entries := fmt.Sprintf("\n# Gla1v3 C2 (auto-added)\n%s api.gla1v3.local\n%s c2.gla1v3.local\n%s dashboard.gla1v3.local\n%s wazuh.gla1v3.local\n", gateway, gateway, gateway, gateway)
	newContent := strings.Join(cleanedLines, "\n") + entries
	
	// Write back
	err = os.WriteFile(hostsPath, []byte(newContent), 0644)
	if err != nil {
		return fmt.Errorf("failed to write hosts file: %v", err)
	}
	
	log.Printf("Updated hosts entries: %s -> *.gla1v3.local", gateway)
	return nil
}

// CleanupHosts removes C2 entries from the hosts file
func CleanupHosts() {
	var hostsPath string
	if runtime.GOOS == "windows" {
		hostsPath = "C:\\Windows\\System32\\drivers\\etc\\hosts"
	} else {
		hostsPath = "/etc/hosts"
	}
	
	// Read current hosts file
	content, err := os.ReadFile(hostsPath)
	if err != nil {
		log.Printf("Failed to read hosts file during cleanup: %v", err)
		return
	}
	
	// Remove Gla1v3 entries
	lines := strings.Split(string(content), "\n")
	var newLines []string
	skipNext := false
	
	for _, line := range lines {
		if strings.Contains(line, "# Gla1v3 C2 (auto-added)") {
			skipNext = true
			continue
		}
		if skipNext && (strings.Contains(line, "api.gla1v3.local") || strings.Contains(line, "c2.gla1v3.local")) {
			continue
		}
		skipNext = false
		newLines = append(newLines, line)
	}
	
	// Write back
	newContent := strings.Join(newLines, "\n")
	err = os.WriteFile(hostsPath, []byte(newContent), 0644)
	if err != nil {
		log.Printf("Failed to write hosts file during cleanup: %v", err)
		return
	}
	
	log.Println("Cleaned up hosts entries")
}
