# Agents

Gla1v3 agents are lightweight Go binaries deployed on target systems to execute tasks and beacon back to the C2 server.

## Technology

- **Language**: Go (Golang)
- **Compilation**: Cross-platform support (Windows, Linux, macOS)
- **Communication**: HTTPS with mutual TLS
- **Footprint**: Small binary size (~2-5 MB depending on embedded tasks)

## Agent Lifecycle

1. **Build**: Operator configures agent through dashboard
2. **Compilation**: Backend compiles Go agent with specific configuration
3. **Deployment**: Operator transfers binary to target system
4. **Execution**: Agent starts, generates metadata, establishes mTLS connection
5. **Registration**: Agent registers with C2 server
6. **Beaconing**: Agent checks in at configured interval
7. **Task Execution**: Agent pulls and executes assigned tasks
8. **Results**: Agent submits task results back to C2

## Configuration

Each agent is compiled with:
- **Unique Agent ID**: CN in certificate
- **Beacon Interval**: Check-in frequency (default: 5 seconds)
- **C2 Server**: Hardcoded server URL
- **TLS Certificates**: Embedded client certificate and CA cert
- **Embedded Tasks**: Optional tasks to run on startup

## Capabilities

### System Information
- OS details, hostname, username
- Network configuration
- Privilege level

### Process Management
- Process enumeration
- Process termination
- Process creation

### File Operations
- Directory listing
- File read/write
- File upload/download

### Command Execution
- Shell command execution
- Custom task execution

## Communication Protocol

Agents use HTTPS with mutual TLS:
1. Agent initiates connection to `c2.gla1v3.local:443`
2. Traefik terminates TLS, validates client certificate
3. Backend authenticates agent via certificate CN
4. Agent sends beacon with metadata
5. Backend responds with pending tasks
6. Agent executes tasks, submits results

## Security

- **mTLS**: Both agent and server verify certificates
- **Unique Certificates**: Each agent has unique client certificate
- **Certificate Validation**: Server validates agent certificate against CA
- **Encrypted Communication**: All traffic over TLS 1.3
- **No Persistence**: Agents don't auto-install persistence (operator must configure)
