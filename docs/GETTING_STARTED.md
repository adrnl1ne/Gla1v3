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
Enable PowerShell script execution, install OpenSSL, and configure Docker Desktop:

1. **Enable Script Execution** (run as Administrator):
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine
   ```

2. **Install OpenSSL**:
   - Download from: https://slproweb.com/products/Win32OpenSSL.html
   - Install the "Win64 OpenSSL v3.x.x" MSI
   - Choose "The OpenSSL binaries (/bin) directory" option during installation
   - Add OpenSSL to PATH: `C:\Program Files\OpenSSL-Win64\bin`

3. **Enable WSL Integration in Docker Desktop**:
   - Open Docker Desktop
   - Go to Settings → Resources → WSL Integration
   - Enable integration for your WSL distribution (e.g., Ubuntu)
   - Click "Apply & Restart"

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

**Windows:** Open WSL terminal, navigate to project directory, then run: `./infra/scripts/startup/start.sh`

**Linux/Mac:** `cd infra && chmod +x scripts/startup/start.sh && ./scripts/startup/start.sh`

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

### Step 3.5: Verifying Your Setup

After startup, perform these checks to ensure everything is working:

#### Database Initialization
On first startup, PostgreSQL runs initialization scripts:
1. `01-schema.sql` - Creates tables (tenants, users, agents, tasks, results, audit_log)
2. `02-rls-policies.sql` - Enables Row-Level Security for multi-tenant isolation
3. `03-functions.sql` - Helper functions
4. `04-create-api-user.sh` - Creates `gla1v3_api` user (non-privileged, RLS enforced)

#### Database Users
| User | Privileges | Purpose |
|------|-----------|---------|
| `gla1v3_app` | SUPERUSER | Admin operations, manual queries |
| `gla1v3_api` | Normal (RLS enforced) | Backend runtime (used by application) |

#### Verification Commands
```bash
# Test RLS (should only see assigned tenant data)
docker exec gla1v3-postgres psql -U gla1v3_api -d gla1v3 -c "
  SET app.current_user_id = 'user-uuid';
  SELECT COUNT(*) FROM agents;
"

# Check backend connection
docker logs backend --tail 20
```

Expected: `✅ Database connected successfully`

### Step 4: Install SSL Certificates

Gla1v3 uses self-signed SSL certificates for secure communication. To avoid browser security warnings, install the Certificate Authority (CA) certificate in your browser.

#### Certificate Location
The CA certificate is generated during startup and located at:
```
certs/ca.crt
```

#### Windows Installation

**For Google Chrome:**
1. Double-click `certs/ca.crt` to open the certificate
2. Click **"Install Certificate"**
3. Select **"Local Machine"** → **"Next"**
4. Select **"Place all certificates in the following store"**
5. Click **"Browse"** → Select **"Trusted Root Certification Authorities"**
6. Click **"OK"** → **"Next"** → **"Finish"**
7. Click **"Yes"** to confirm installation

**For Microsoft Edge:**
1. Open Settings (⋮) → **Privacy, search, and services**
2. Scroll to **Security** → **Manage certificates**
3. Go to **"Trusted Root Certification Authorities"** tab
4. Click **"Import"**
5. Click **"Next"** → Browse to `certs/ca.crt`
6. Click **"Next"** → Select **"Trusted Root Certification Authorities"**
7. Click **"Next"** → **"Finish"** → **"Yes"** to install

**For Firefox:**
1. Open Firefox Settings → **Privacy & Security**
2. Scroll to **Certificates** → **View Certificates**
3. Go to **"Authorities"** tab → Click **"Import"**
4. Select `certs/ca.crt`
5. Check **"Trust this CA to identify websites"**
6. Click **"OK"**

#### Linux Installation

**For Firefox:**
```bash
# Import certificate to Firefox NSS database
certutil -A -n "Gla1v3-CA" -t "TC,," -i certs/ca.crt -d ~/.mozilla/firefox/*.default
```

**For System-wide (Ubuntu/Debian):**
```bash
sudo cp certs/ca.crt /usr/local/share/ca-certificates/gla1v3-ca.crt
sudo update-ca-certificates
```

**For System-wide (RHEL/CentOS):**
```bash
sudo cp certs/ca.crt /etc/pki/ca-trust/source/anchors/gla1v3-ca.crt
sudo update-ca-trust
```

#### macOS Installation

**For System Keychain:**
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certs/ca.crt
```

**For Firefox:**
1. Open Firefox Preferences → **Privacy & Security**
2. Scroll to **Certificates** → **View Certificates**
3. Go to **"Authorities"** tab → Click **"Import"**
4. Select `certs/ca.crt`
5. Check **"Trust this CA to identify websites"**
6. Click **"OK"**

#### Verification

After installation:
1. **Restart your browser**
2. Navigate to `https://dashboard.gla1v3.local`
3. You should see a secure connection (lock icon) without warnings

### Step 4.5: Configure Local DNS Resolution

**Important**: Gla1v3 uses local domain names that need to be resolved to `127.0.0.1`. Add these entries to your hosts file:

#### Windows
1. Open Notepad as Administrator
2. Open `C:\Windows\System32\drivers\etc\hosts`
3. Add these lines at the end:
   ```
   127.0.0.1 dashboard.gla1v3.local
   127.0.0.1 api.gla1v3.local
   127.0.0.1 c2.gla1v3.local
   127.0.0.1 ca.gla1v3.local
   127.0.0.1 gla1v3.local
   ```
4. Save the file

#### Linux/macOS
Add to `/etc/hosts`:
```
127.0.0.1 dashboard.gla1v3.local api.gla1v3.local c2.gla1v3.local ca.gla1v3.local gla1v3.local
```

### Step 5: Access the Dashboard

Open your browser and navigate to:
```
https://dashboard.gla1v3.local
```

If you didn't install the CA certificate, you'll see a security warning. Click "Advanced" and proceed (not recommended for production).

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

#### Prerequisites for Wazuh
- **Additional 4GB RAM** (total 12GB+ recommended)
- **10GB disk space** for alert indexing
- Main infrastructure must be running first

#### Quick Start Commands
**Start Wazuh + OpenSearch:**
```powershell
cd infra/wazuh
docker compose up -d
```

**Verify services:**
```powershell
docker compose ps
```
Expected: `wazuh`, `opensearch`, `wazuh-indexer` containers running.

#### Integrating with Gla1v3
1. Start main C2 infra first: `cd infra && .\scripts\startup\start.ps1` (Windows) or `cd infra && ./scripts/startup/start.sh` (Linux/Mac)
2. Wazuh will be available to the backend via configured API URL
3. Use the dashboard `Alert Table` to view correlated EDR detections

#### Deploying Wazuh Agents

To get full EDR visibility, deploy Wazuh agents on your test/target machines alongside Gla1v3 agents:

**Download Wazuh Agent:**
- Visit: https://packages.wazuh.com/4.x/windows/wazuh-agent-4.x.x-x.msi (Windows)
- Visit: https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/ (Linux)
- Or use package managers: `apt install wazuh-agent` (Ubuntu/Debian)

**Install and Configure:**

**Windows:**
```powershell
# Download and install MSI
msiexec /i wazuh-agent-4.x.x-x.msi /q WAZUH_MANAGER="localhost" WAZUH_REGISTRATION_SERVER="localhost"

# Or configure after installation
& "C:\Program Files (x86)\ossec-agent\agent-auth.exe" -m localhost
& "C:\Program Files (x86)\ossec-agent\ossec-control.exe" start
```

**Linux:**
```bash
# Install package
wget https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_4.x.x-x_amd64.deb
sudo dpkg -i wazuh-agent_4.x.x-x_amd64.deb

# Configure manager IP
sudo sed -i 's/MANAGER_IP/localhost/g' /var/ossec/etc/ossec.conf

# Register and start
sudo /var/ossec/bin/agent-auth -m localhost
sudo systemctl enable wazuh-agent
sudo systemctl start wazuh-agent
```

**Verify Agent Connection:**
```bash
# Check agent status
sudo /var/ossec/bin/ossec-control status

# Check manager connection
sudo tail -f /var/ossec/logs/ossec.log
```

**Expected**: Agent appears as "Active" in Wazuh Dashboard → Agents section

#### Wazuh Access
- **Wazuh API**: https://localhost:55001 (user: `wazuh` / pass: `wazuh`)
- **Dashboard**: https://localhost:8443
- **OpenSearch**: http://localhost:9200

#### Wazuh Troubleshooting
- **Agents not connecting**: Check Wazuh manager logs: `docker compose logs wazuh --tail 50`
- **No alerts**: Ensure Wazuh agent can reach manager (port 1514) and check OpenSearch indices

#### Wazuh Files & Locations
- Compose file: `infra/wazuh/docker-compose.yml`
- Rules: `infra/wazuh/wazuh-rules/`
- Indexer helper: `infra/wazuh/wazuh-config/wazuh-indexer.sh`

### Wazuh Requirements

- **Additional 4GB RAM** for OpenSearch and Wazuh containers
- **10GB disk space** for alert indexing
- Main infrastructure must be running first (use `.\scripts\startup\start.ps1` on Windows or `./scripts/startup/start.sh` on Linux/Mac)

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
- Ensure main infrastructure is running first (run `.\scripts\startup\start.ps1` on Windows or `./scripts/startup/start.sh` on Linux/Mac)
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
