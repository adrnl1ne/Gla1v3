# Getting Started with Gla1v3

This guide will walk you through setting up Gla1v3 for the first time, from installation through deploying your first agent.

## Prerequisites

Before you begin, ensure you have:

- **Docker Desktop** installed and running
  - Windows: Docker Desktop for Windows with WSL2 backend
  - Linux: Docker Engine + Docker Compose
  - macOS: Docker Desktop for Mac
- **Minimum 8GB RAM** available for containers
- **20GB disk space** for images and data
- **Administrator/sudo privileges** for Docker operations

### System Configuration

#### Windows Users
No additional configuration needed - the PowerShell script handles everything automatically.

#### Linux/Mac Users
Ensure your user is in the docker group:
```bash
sudo usermod -aG docker $USER
# Log out and back in for changes to take effect
```

## Installation Steps

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd Gla1v3
```

### Step 2: Start the Platform

Navigate to the infrastructure directory:
```bash
cd infra
```

Run the startup script:

**Windows:** `.\start.ps1`

**Linux/Mac:** `chmod +x start.sh && ./start.sh`

The startup script will:
1. Generate secure certificates for mTLS
2. Create random passwords for services
3. Build Docker containers
4. Start all services
5. Display access credentials

**Initial startup takes 5-10 minutes** as containers download and build.

### Step 3: Verify Services

Once startup completes, verify all services are running:

```bash
docker ps
```

You should see containers for:
- `gla1v3-frontend` - Dashboard UI
- `gla1v3-backend` - API server
- `gla1v3-ca-service` - Certificate authority
- `gla1v3-traefik` - Reverse proxy
- `wazuh-*` - EDR components

### Step 4: Access the Dashboard

Open your browser and navigate to:
```
https://dashboard.gla1v3.local
```

**Note**: You'll see a security warning because of self-signed certificates. This is expected in a test environment. Click "Advanced" and proceed.

Login with the credentials displayed during startup (default: `admin / admin123`).

**Important**: Change the admin password immediately after first login from the user settings menu.

## Building Your First Agent

### Step 1: Navigate to Agent Builder

From the dashboard, click on **"Build Agent"** in the navigation menu.

### Step 2: Configure Agent Settings

You'll see several configuration options:

- **Beacon Interval**: How often the agent checks in (default: 5 seconds)
  - Lower values = more responsive but noisier
  - Higher values = stealthier but slower response
  
- **Embedded Tasks**: Select tasks to run automatically when the agent starts
  - `sys_info` - System information collection
  - `proc_list` - Process enumeration
  - `priv_check` - Privilege status check
  - `file_list` - Directory listing

**For your first agent**, use these settings:
- Beacon Interval: 5 seconds
- Embedded Tasks: sys_info, proc_list

### Step 3: Build the Agent

Click **"Build Agent"** button. The platform will:
1. Generate a unique agent ID
2. Create agent-specific certificates
3. Compile the Go agent with your configuration
4. Provide a download link

Download the compiled binary. The filename will include a timestamp (e.g., `agent-20250124123045.exe`).

### Step 4: Deploy the Agent

#### Test Environment (Same Machine)

Simply run the agent binary:

**Windows:** `.\agent-TIMESTAMP.exe`

**Linux/Mac:** `chmod +x agent-TIMESTAMP && ./agent-TIMESTAMP`

#### Remote Target

Transfer the agent to your target system:
- SCP/SFTP for Linux systems
- PowerShell Remoting for Windows
- USB drive for air-gapped systems
- Payload delivery in red team exercises

Then execute using the same commands as above.

### Step 5: Verify Agent Connection

Return to the dashboard. Within 5-10 seconds, you should see:

1. **Agent appears on world map** - Shows geo-location based on public IP
2. **Agent status**: Green indicator showing "Active"
3. **Agent details**: 
   - Agent ID (CN)
   - IP addresses (local and public)
   - Operating system
   - Last action timestamp

### Step 6: Execute a Task

Test agent communication by running a quick command:

1. Click on your agent in the agent list
2. In the **Task Panel**, find **"Quick Commands"**
3. Click **"whoami"** or **"hostname"**
4. Watch the **Agent Activity Log** for execution

Within seconds, you'll see the command output in the task results.

## Understanding the Dashboard

### World Map
Shows all connected agents with their geographic locations based on public IP addresses. Click on markers to see agent details.

### Agent Table
Lists all registered agents with their status, operating system, IP addresses, and last activity. Green = active (beaconed recently), Red = inactive (no beacon in 60+ seconds).

### Task Panel
Manage agent tasks with three sections:
- **Quick Commands**: Pre-configured OS-appropriate commands
- **Task Builder**: Create custom tasks with embedded capabilities
- **Task History**: View results from completed tasks

### Alert Table
Displays EDR alerts correlated with agent IDs. Shows detection events from integrated EDR systems (requires Wazuh EDR to be running).

## EDR Integration (Optional)

The platform includes **Wazuh EDR** for advanced threat detection and monitoring. EDR integration is **optional** - the C2 platform works fully without it.

### Starting Wazuh EDR

The start scripts will automatically attempt to start Wazuh **only if** the `infra/wazuh` folder is present. If Wazuh is not configured or fails to start you may see:

```
⚠️  Wazuh EDR failed to start (platform will work without EDR)
```

This is **not a critical error** — the core C2 services (DB, backend, Redis, Traefik) will start independently because Wazuh is optional and no longer required by the top‑level compose configuration.

### Manual Wazuh Startup

If you want to enable EDR monitoring:

**Windows:**
```powershell
cd infra\wazuh
docker compose up -d
```

**Linux/Mac:**
```bash
cd infra/wazuh
docker compose up -d
```

**Access Wazuh Dashboard:**
- URL: `http://localhost:8443`
- Username: `admin`
- Password: `SecretPassword`

### Wazuh Requirements

- **Additional 4GB RAM** for OpenSearch and Wazuh containers
- **10GB disk space** for alert indexing
- Main infrastructure must be running first

### Without Wazuh

If you skip Wazuh:
- ✅ All C2 functionality works (agents, tasks, beacons)
- ✅ Agent monitoring and control fully operational
- ❌ Alert correlation unavailable
- ❌ EDR detections not shown in Alert Table

## Common Issues and Solutions

### Certificate Warnings in Browser
**Issue**: Browser shows "Your connection is not private"  
**Solution**: This is expected with self-signed certificates. Click "Advanced" → "Proceed to site"  
**Production**: Replace with proper TLS certificates from a trusted CA

### Agent Won't Connect
**Issue**: Agent starts but doesn't appear on dashboard

**Solutions**:
- Check agent has network access to c2.gla1v3.local
- Ensure firewall isn't blocking port 443
- Look for connection errors in agent console output
- Verify Docker containers are running: `docker ps`

### Services Won't Start
**Issue**: Docker containers fail to start  
**Solutions**:
- Ensure Docker Desktop is running
- Check available RAM (need 8GB minimum for core, 12GB with Wazuh)
- Review logs: `docker logs gla1v3-backend`
- Try stopping and restarting: `docker compose down && docker compose up -d`

### Wazuh Won't Start
**Issue**: Wazuh EDR fails to start or shows errors  
**Solutions**:
- Ensure main infrastructure is running first (`cd infra && docker compose ps`)
- Check if you have 12GB+ RAM available (Wazuh needs 4GB extra)
- Verify network exists: `docker network ls | grep wazuh-net`
- Try manual start: `cd infra/wazuh && docker compose up -d`
- View logs: `docker logs wazuh-edr`
- **Remember**: Platform works fully without Wazuh - EDR is optional

### Wrong Geo-Location
**Issue**: Agent shows incorrect location on map  
**Explanation**: Geo-location is based on public IP address. If you're testing on the same machine or behind NAT, it shows your router's location, not the exact endpoint.

## Next Steps

Now that you have a working agent:

- Experiment with different task types in the Task Panel
- Test beacon intervals to understand agent behavior
- Review the Alert Table to see EDR correlation
- Explore the agent build options for different scenarios

## Security Reminder

Gla1v3 is a penetration testing tool. Always ensure:
- ✅ You have written authorization to deploy agents
- ✅ Target systems are within scope of your assessment
- ✅ You follow responsible disclosure practices
- ✅ Test environments are properly isolated
- ✅ Production credentials are changed from defaults

Unauthorized access to computer systems is illegal. Use responsibly.
