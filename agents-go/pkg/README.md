# Agent Modules

This directory contains the modular components of the Gla1v3 agent. The agent has been refactored from a monolithic design into discrete, reusable packages.

## Package Structure

### `config/`
Manages agent configuration including build-time settings and runtime configuration.

**Key Features:**
- Build-time variable injection via `-ldflags`
- Environment variable overrides
- Embedded certificate management
- Configuration validation

**Main Types:**
- `Config`: Runtime configuration struct
- `Load()`: Creates config from environment and defaults
- `GetEmbeddedCerts()`: Returns embedded certificates
- `GetEmbeddedTasks()`: Returns embedded task definitions

### `client/`
Handles HTTP client setup with mTLS support.

**Key Features:**
- mTLS client certificate configuration
- Multiple client types (C2, API, Whoami)
- Certificate loading (embedded or file-based)
- DNS bypass for VM environments
- TLS configuration for different server endpoints

**Main Types:**
- `Client`: HTTP client wrapper with mTLS
- `Setup()`: Initializes HTTP clients
- `LoadCertificates()`: Loads certs from embedded or file sources

### `tasks/`
Executes tasks received from C2 server.

**Key Features:**
- Command execution with timeout handling
- Embedded task support
- System information collection
- Privilege checking
- Result submission to C2

**Main Types:**
- `Task`: Task definition
- `TaskResult`: Task execution result
- `Executor`: Task execution engine
- `ExecuteEmbedded()`: Runs predefined tasks
- `Execute()`: Runs C2-issued commands

**Supported Task Types:**
- `sys_info`: Collect system information
- `cmd`: Execute shell commands
- `priv_check`: Check privilege level
- `network_scan`: Network scanning (placeholder)
- `file_search`: File searching (placeholder)

### `system/`
Collects system information and metadata.

**Key Features:**
- Local IP detection
- Public IP detection (via whoami endpoint or external services)
- System metadata collection
- Cross-platform support (Windows/Linux)

**Main Types:**
- `Info`: System information struct
- `GetLocalIP()`: Detects local IP address
- `GetPublicIP()`: Detects public IP
- `GetWhoamiOutput()`: Runs whoami command
- `CollectInfo()`: Gathers comprehensive system info

### `network/`
Manages network configuration and gateway detection.

**Key Features:**
- Automatic gateway detection
- Host-Only network detection for VMs
- Hosts file management
- Network reachability testing

**Main Types:**
- `DetectGateway()`: Finds C2 host IP
- `TestHostReachable()`: Tests if host is accessible
- `SetupHosts()`: Adds C2 domains to hosts file
- `CleanupHosts()`: Removes C2 entries on shutdown

### `beacon/`
Implements the beaconing loop to C2 server.

**Key Features:**
- Periodic beaconing to C2
- Task retrieval from C2
- Structured payload construction
- Sequence tracking

**Main Types:**
- `Beacon`: Beacon management
- `New()`: Creates beacon instance
- `Send()`: Sends single beacon
- `Loop()`: Runs continuous beacon loop
- `Response`: C2 response with tasks

## Usage Example

```go
package main

import (
    "agents-go/pkg/beacon"
    "agents-go/pkg/client"
    "agents-go/pkg/config"
    "agents-go/pkg/network"
    "agents-go/pkg/system"
    "agents-go/pkg/tasks"
)

func main() {
    // 1. Load configuration
    cfg := config.Load()
    
    // 2. Setup network
    gateway, _ := network.DetectGateway()
    network.SetupHosts(gateway)
    
    // 3. Load certificates
    cert, ca, _ := client.LoadCertificates(...)
    
    // 4. Setup clients
    httpClient := client.Setup(cfg.ServerName, cfg.APIServerName, cert, ca, gateway)
    
    // 5. Setup task executor
    taskExec := tasks.NewExecutor(cfg.AgentID, cfg.C2URL, httpClient.APIClient)
    
    // 6. Start beaconing
    b := beacon.New(cfg.AgentID, cfg.C2URL, cfg.BeaconInterval, httpClient.C2Client)
    b.Loop(
        func() (string, string) {
            return system.GetWhoamiOutput()
        },
        func() map[string]interface{} {
            return system.CollectInfo(...).FormatForBeacon()
        },
        func(tasks []beacon.TaskInfo) {
            // Execute tasks
        },
    )
}
```

## Adding New Functionality

### Adding New Task Types

1. Define the task type in `tasks/executor.go`:
```go
case "my_new_task":
    result.Output = myNewTaskFunction(task.Params)
```

2. Implement the task function:
```go
func myNewTaskFunction(params map[string]string) string {
    // Your task logic here
    return "result"
}
```

### Adding New System Info Collectors

Add new functions to `system/info.go`:
```go
func GetNewInfo() string {
    // Collection logic
    return info
}
```

### Extending Network Capabilities

Add new network functions to `network/network.go`:
```go
func NewNetworkFeature() error {
    // Network feature logic
    return nil
}
```

## Build Configuration

Build-time variables can be injected via `-ldflags`:

```bash
go build -ldflags "
    -X 'agents-go/pkg/config.BeaconInterval=15s'
    -X 'agents-go/pkg/config.C2Server=custom.c2.local:443'
    -X 'agents-go/pkg/config.EmbeddedCert=...'
" cmd/agent/main.go
```

## Testing

Each package can be tested independently:

```bash
# Test specific package
go test ./pkg/config
go test ./pkg/tasks
go test ./pkg/network

# Test all packages
go test ./pkg/...
```

## Benefits of Modular Design

1. **Maintainability**: Each package has a single responsibility
2. **Testability**: Packages can be tested in isolation
3. **Reusability**: Packages can be used in other projects
4. **Extensibility**: Easy to add new features without touching existing code
5. **Readability**: Smaller, focused files are easier to understand
6. **Build Flexibility**: Modules can be conditionally compiled or replaced

## Migration from Monolithic Version

The monolithic `main.go` has been split into:
- Configuration logic → `config/`
- HTTP/TLS setup → `client/`
- Task execution → `tasks/`
- System info → `system/`
- Network management → `network/`
- Beacon loop → `beacon/`
- Main entry point → `cmd/agent/main.go` (now ~130 lines vs ~800+)

All functionality remains the same, but the code is now organized for better maintainability and extensibility.
