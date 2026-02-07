# Agent Features Roadmap

This document outlines potential new capabilities for the modular agent, organized by package.

## 🎯 Immediate Enhancements (Easy Wins)

### `pkg/tasks/` - New Task Types

#### 1. **File Operations**
```go
case "file_download":
    // Download file from agent to C2
    path := task.Params["path"]
    result.Output = downloadFile(path)

case "file_upload":
    // Upload file from C2 to agent
    path := task.Params["path"]
    data := task.Params["data"] // base64 encoded
    result.Output = uploadFile(path, data)

case "file_list":
    // List directory contents
    path := task.Params["path"]
    result.Output = listDirectory(path)

case "file_delete":
    // Delete file or directory
    path := task.Params["path"]
    result.Output = deleteFile(path)
```

#### 2. **Process Management**
```go
case "proc_list":
    // List running processes
    result.Output = listProcesses()

case "proc_kill":
    // Kill a process by PID or name
    pid := task.Params["pid"]
    result.Output = killProcess(pid)

case "proc_start":
    // Start a new process
    cmd := task.Params["command"]
    result.Output = startProcess(cmd)
```

#### 3. **Screenshot Capture** (requires external libs)
```go
case "screenshot":
    // Capture screen and upload
    result.Output = captureScreenshot()
```

#### 4. **Keylogging** (advanced)
```go
case "keylog_start":
    // Start keylogger
    result.Output = startKeylogger()

case "keylog_stop":
    // Stop and retrieve logs
    result.Output = stopKeylogger()
```

### `pkg/system/` - Enhanced Info Collection

#### 1. **Process Enumeration**
```go
// GetRunningProcesses returns list of processes
func GetRunningProcesses() []ProcessInfo

type ProcessInfo struct {
    PID     int
    Name    string
    User    string
    CPU     float64
    Memory  uint64
}
```

#### 2. **Environment Enumeration**
```go
// GetEnvironmentVars returns all env variables
func GetEnvironmentVars() map[string]string

// GetInstalledSoftware lists installed applications
func GetInstalledSoftware() []string

// GetNetworkConnections lists active connections
func GetNetworkConnections() []Connection
```

#### 3. **Credential Harvesting** (sensitive)
```go
// GetSavedCredentials attempts to extract saved credentials
func GetSavedCredentials() []Credential

// GetBrowserPasswords extracts browser saved passwords
func GetBrowserPasswords() []BrowserCred
```

### `pkg/network/` - Advanced Network Features

#### 1. **Port Scanning**
```go
// ScanPorts scans range of ports on target
func ScanPorts(target string, startPort, endPort int) []int

// ScanSubnet discovers live hosts on subnet
func ScanSubnet(subnet string) []string
```

#### 2. **Network Pivoting**
```go
// CreateSOCKSProxy creates a SOCKS proxy tunnel
func CreateSOCKSProxy(localPort int) error

// PortForward forwards traffic from local to remote
func PortForward(localPort int, remoteHost string, remotePort int) error
```

#### 3. **Traffic Capture**
```go
// CaptureTraffic captures network packets
func CaptureTraffic(duration time.Duration, filter string) []byte
```

### `pkg/client/` - Communication Enhancements

#### 1. **Alternative Protocols**
```go
// DNSClient - DNS tunneling for stealth
type DNSClient struct {}

// HTTPSClient - Regular HTTPS (less suspicious than mTLS)
type HTTPSClient struct {}

// WebSocketClient - Persistent connection
type WebSocketClient struct {}
```

#### 2. **Domain Fronting**
```go
// SetupDomainFronting configures CDN fronting
func SetupDomainFronting(frontDomain, actualDomain string)
```

### `pkg/config/` - Runtime Reconfiguration

#### 1. **Dynamic Config Updates**
```go
// UpdateConfig allows C2 to change settings on the fly
func (c *Config) Update(newInterval time.Duration, newC2 string)

// EnableStealthMode reduces beacon frequency, disables logging
func (c *Config) EnableStealthMode()
```

## 🚀 Advanced Features

### New Package: `pkg/persistence/`
```go
// Windows
- Registry Run Keys
- Scheduled Tasks
- Services
- WMI Event Subscriptions
- Startup Folder

// Linux
- Cron Jobs
- Systemd Services
- .bashrc/.profile
- Init.d scripts
```

### New Package: `pkg/evasion/`
```go
// Anti-Detection
- Process Hollowing
- DLL Injection
- Unhooking
- Parent Process Spoofing
- AMSI Bypass (Windows)

// Anti-Analysis
- VM Detection
- Sandbox Detection
- Debugger Detection
- Sleep Obfuscation
```

### New Package: `pkg/lateral/`
```go
// Lateral Movement
- SMB Share Enumeration
- WMI Remote Execution (Windows)
- SSH Lateral Movement (Linux)
- Pass-the-Hash
- Kerberoasting
```

### New Package: `pkg/exfil/`
```go
// Data Exfiltration
- Chunked Upload (for large files)
- Compression
- Encryption
- Steganography
- DNS Exfiltration
- ICMP Tunneling
```

### New Package: `pkg/shellcode/`
```go
// In-Memory Execution
- Execute Shellcode
- Load .NET Assembly
- Reflective DLL Loading
- PE Loading from Memory
```

## 🛡️ Security & Stealth Enhancements

### 1. **Communication Security**
```go
// Jitter - Randomize beacon intervals
func (b *Beacon) EnableJitter(variance float64)

// Sleep - Extended sleep with random wake
func (b *Beacon) Sleep(duration time.Duration)

// Burst Mode - Multiple rapid beacons then sleep
func (b *Beacon) BurstMode(count int, interval time.Duration)
```

### 2. **Encrypted Task Storage**
```go
// Store tasks encrypted on disk for offline execution
type TaskQueue struct {
    encrypted []byte
}
```

### 3. **Self-Destruct**
```go
// SelfDestruct removes agent and cleans artifacts
func SelfDestruct()

// PartialCleanup removes logs but keeps agent
func PartialCleanup()
```

## 📦 Module Organization Example

### `pkg/recon/` - Reconnaissance Module
```go
type Recon struct {
    // System reconnaissance
    func CollectAll() ReconReport
    func FindSensitiveFiles(patterns []string) []string
    func MapNetwork() NetworkMap
    func EnumerateShares() []Share
}
```

### `pkg/exploit/` - Post-Exploitation
```go
type Exploit struct {
    func DumpLSASS() []byte
    func ExtractSAM() []Credential
    func TokenImpersonation(user string) error
}
```

## 🎨 Implementation Priority

### Phase 1: Core Functionality (Week 1-2)
- ✅ Modular structure (DONE)
- [ ] File operations (upload/download/list)
- [ ] Process management (list/kill/start)
- [ ] Enhanced system enumeration

### Phase 2: Stealth & Stability (Week 3-4)
- [ ] Beacon jitter
- [ ] Multiple C2 protocols
- [ ] Error recovery and retry logic
- [ ] Log cleanup

### Phase 3: Advanced Features (Month 2)
- [ ] Persistence mechanisms
- [ ] Port scanning & pivoting
- [ ] Screenshot & keylogging
- [ ] Encrypted task queue

### Phase 4: Red Team Features (Month 3+)
- [ ] Credential harvesting
- [ ] Lateral movement
- [ ] Anti-detection/evasion
- [ ] Shellcode execution

## 💡 Implementation Tips

1. **Keep it modular**: Each feature should be in its own package
2. **Cross-platform**: Use runtime.GOOS checks for OS-specific code
3. **Error handling**: Never crash, always report errors to C2
4. **Logging**: Configurable verbosity levels
5. **Testing**: Build test harnesses for each module
6. **Documentation**: Update pkg/README.md as you add features

## 🔒 Legal & Ethical Considerations

⚠️ **WARNING**: Many of these features are powerful and potentially dangerous:
- Only use in authorized penetration testing environments
- Obtain written permission before deployment
- Follow responsible disclosure practices
- Comply with local laws and regulations

## 📚 External Libraries to Consider

```go
// For advanced features
github.com/kbinani/screenshot          // Screenshots
github.com/shirou/gopsutil/v3          // System info
github.com/google/gopacket             // Packet capture
github.com/StackExchange/wmi           // Windows WMI
golang.org/x/sys/windows/registry      // Windows Registry
golang.org/x/crypto                    // Advanced crypto
```

---

**Next Steps**: Pick 2-3 features from Phase 1 to implement first!
