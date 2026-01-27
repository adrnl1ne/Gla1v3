# Gla1v3 Agents

This directory contains multiple agent types for the Gla1v3 C2 framework.

## Agent Types

### 1. Main Agent (`cmd/agent/main.go`)
- **Purpose**: Persistent beacon with command execution
- **Features**:
  - Continuous beaconing to C2
  - Executes `whoami` and reports system user
  - Receives and executes tasks from C2
  - Reports local and public IP addresses
  - Geolocation support
- **Detection Risk**: Medium (continuous activity)

### 2. File Enumeration Agent (`cmd/agent-fileenum/main.go`)
- **Purpose**: One-shot file system reconnaissance
- **Features**:
  - Enumerates sensitive directories (Documents, Desktop, Downloads, System32\config)
  - Reports file listings
  - Single execution, then exits
- **Detection Risk**: High (file system enumeration triggers EDR)

### 3. Registry Enumeration Agent (`cmd/agent-regenum/main.go`)
- **Purpose**: Windows registry reconnaissance
- **Features**:
  - Enumerates Run keys (persistence locations)
  - Scans Services registry
  - Attempts SAM database access (highly suspicious)
  - Windows only
- **Detection Risk**: Very High (registry access triggers behavioral detection)

### 4. Network Scanner Agent (`cmd/agent-netscan/main.go`)
- **Purpose**: Local network reconnaissance
- **Features**:
  - Discovers local subnet
  - Port scans common services (22, 80, 135, 139, 443, 445, 3389, etc.)
  - Identifies active hosts
- **Detection Risk**: High (network scanning triggers IDS/IPS)

### 5. System Info Agent (`cmd/agent-sysinfo/main.go`)
- **Purpose**: System reconnaissance and profiling
- **Features**:
  - Collects OS version, architecture
  - Enumerates processes
  - Network configuration
  - User accounts and groups
  - Cross-platform (Windows/Linux)
- **Detection Risk**: High (multiple recon commands in sequence)

## Building Agents

### Build all agents:
```bash
cd agents-go
go build -o bin/agent.exe ./cmd/agent
go build -o bin/agent-fileenum.exe ./cmd/agent-fileenum
go build -o bin/agent-regenum.exe ./cmd/agent-regenum
go build -o bin/agent-netscan.exe ./cmd/agent-netscan
go build -o bin/agent-sysinfo.exe ./cmd/agent-sysinfo
```

### Build for Linux:
```bash
GOOS=linux GOARCH=amd64 go build -o bin/agent-linux ./cmd/agent
GOOS=linux GOARCH=amd64 go build -o bin/agent-sysinfo-linux ./cmd/agent-sysinfo
```

## Running Agents

All agents use the same certificate configuration:

```bash
# Using environment variables
export AGENT_CERT_PATH=/path/to/agent-client.crt
export AGENT_KEY_PATH=/path/to/agent-client.key
export AGENT_CA_PATH=/path/to/ca.crt
export C2_URL=https://c2.gla1v3.local:4443/beacon

# Run main agent (persistent)
./bin/agent.exe

# Run specialized agents (one-shot)
./bin/agent-fileenum.exe
./bin/agent-regenum.exe
./bin/agent-netscan.exe
./bin/agent-sysinfo.exe
```

## Deployment Strategy

**For EDR Testing:**
1. Deploy main agent first for baseline activity
2. Deploy specialized agents one at a time
3. Monitor Wazuh alerts between deployments
4. Each specialized agent runs once and exits

**For Red Team Operations:**
1. Use main agent for C&C channel
2. Task main agent to execute specific commands
3. Deploy specialized agents only when needed
4. Stagger execution to avoid detection correlation

## Security Considerations

⚠️ **All agents use mTLS with client certificates** - ensure certificates are properly secured

⚠️ **Specialized agents are designed to trigger EDR** - use only in controlled environments

⚠️ **Agents send data to C2** - ensure C2 infrastructure is properly secured and authorized

## Task System

The main agent supports receiving tasks from C2:

```bash
# Send task via API
curl -X POST https://api.gla1v3.local/api/agents/{agentId}/tasks \
  -H "Content-Type: application/json" \
  -d '{"cmd": "whoami", "args": []}'

# Check task results
curl https://api.gla1v3.local/api/agents/{agentId}/tasks
```

Tasks are executed asynchronously and results are reported back to C2.
