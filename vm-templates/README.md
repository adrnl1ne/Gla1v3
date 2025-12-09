# Gla1v3 VM Templates

Pre-configured virtual machine templates for deploying and testing agents in isolated environments using **VMware Workstation/Player** or **VirtualBox**.

## 🚀 Quick Start

**New to this? Start here:** [vmware-virtualbox/QUICKSTART.md](./vmware-virtualbox/QUICKSTART.md) (15-minute setup)

**For detailed instructions:** [vmware-virtualbox/README.md](./vmware-virtualbox/README.md)

## VM Types

### Windows 10/11 Target VM
- **Purpose**: Test Windows-specific agents (registry enum, file enum, system recon)
- **Recommended Specs**: 4GB RAM, 2 CPUs, 60GB disk
- **Network**: Host-only adapter (192.168.56.0/24)
- **Default IP**: 192.168.56.10

### Ubuntu 22.04 Target VM  
- **Purpose**: Test cross-platform agents (file enum, network scan, system recon)
- **Recommended Specs**: 2GB RAM, 2 CPUs, 25GB disk
- **Network**: Host-only adapter (192.168.56.0/24)
- **Default IP**: 192.168.56.11

## Directory Structure

```
vm-templates/
├── README.md                      # This file
├── setup-windows-target.ps1       # Windows VM configuration script
├── setup-linux-target.sh          # Linux VM configuration script
└── vmware-virtualbox/             # VMware/VirtualBox documentation
    ├── QUICKSTART.md             # Fast setup guide (15 min)
    ├── README.md                 # Complete documentation
    ├── build-windows-template.ps1 # Windows template builder (optional)
    └── build-ubuntu-template.sh   # Ubuntu template builder (optional)
```

## Setup Steps

### 1. Create VM in VMware/VirtualBox GUI
- File → New Virtual Machine (VMware) or Machine → New (VirtualBox)
- Select Windows 10 or Ubuntu 22.04 ISO
- Configure resources (see specs above)
- **Important**: Set network to Host-only adapter

### 2. Install Operating System
- Username: `vagrant`
- Password: `vagrant`
- Enable SSH on Ubuntu

### 3. Run Setup Script
Transfer the setup script to your VM using one of these methods:

**Option A: VMware/VirtualBox Shared Folder** (Recommended)
- Enable shared folders in VM settings
- Share your Gla1v3 repository folder from host

**Option B: Host C2 Server Files**
- Copy scripts to `backend/public/` folder
- Access via `http://192.168.56.1:3000/`

**Option C: SCP Transfer**
- Use Windows OpenSSH or PuTTY/WinSCP
- Transfer from host to VM over network

**Windows** (PowerShell as Administrator):
```powershell
# From shared folder
Copy-Item "\\vmware-host\Shared Folders\Gla1v3\vm-templates\setup-windows-target.ps1" -Destination "$env:TEMP\setup.ps1"
PowerShell -ExecutionPolicy Bypass -File "$env:TEMP\setup.ps1" -C2Server "192.168.56.1"
```

**Linux**:
```bash
# From shared folder
sudo cp /mnt/hgfs/Gla1v3/vm-templates/setup-linux-target.sh /tmp/setup.sh
chmod +x /tmp/setup.sh
sudo C2_SERVER="192.168.56.1" /tmp/setup.sh
```

### 4. Take Snapshot
Create a "Clean State" snapshot before deploying any agents for easy restoration.

## Testing Workflow

1. **Create VM** → Import OVA or create manually in VMware/VirtualBox
2. **Take Snapshot** → "Clean State" before deploying agents
3. **Deploy Agent** → From dashboard or run deploy script
4. **Test & Monitor** → Trigger EDR alerts, watch Wazuh dashboard
5. **Restore Snapshot** → Return to clean state for next test
6. **Clone VM** → Create multiple targets for parallel testing

## Network Configuration

All VMs need to resolve Gla1v3 domains. Add to hosts file:

**Windows** (`C:\Windows\System32\drivers\etc\hosts`):
```
<C2_SERVER_IP> c2.gla1v3.local
<C2_SERVER_IP> api.gla1v3.local
<C2_SERVER_IP> dashboard.gla1v3.local
```

**Linux** (`/etc/hosts`):
```
<C2_SERVER_IP> c2.gla1v3.local
<C2_SERVER_IP> api.gla1v3.local
<C2_SERVER_IP> dashboard.gla1v3.local
```

## Agent Deployment

### From VM (Quick Deploy Scripts)

**Windows** (inside VM):
```powershell
# Deploy main beacon agent
C:\Gla1v3\agents\deploy-agent.ps1 -AgentType main

# Deploy specialized agents
C:\Gla1v3\agents\deploy-agent.ps1 -AgentType fileenum
C:\Gla1v3\agents\deploy-agent.ps1 -AgentType regenum
C:\Gla1v3\agents\deploy-agent.ps1 -AgentType netscan
C:\Gla1v3\agents\deploy-agent.ps1 -AgentType sysinfo
```

**Linux** (inside VM):
```bash
# Deploy main beacon agent
sudo /opt/gla1v3/agents/deploy-agent.sh main

# Deploy specialized agents
sudo /opt/gla1v3/agents/deploy-agent.sh fileenum
sudo /opt/gla1v3/agents/deploy-agent.sh netscan
sudo /opt/gla1v3/agents/deploy-agent.sh sysinfo
```

### From Dashboard (Command Tasking)

Use the TaskPanel in the dashboard to send commands to already-deployed beacon agents:
1. Dashboard → Select agent → Click "Task" button
2. Enter command and arguments
3. Monitor execution results

**Note**: Download endpoint for agent binaries is planned but not yet implemented.

## Security Considerations

⚠️ **These VMs are intentionally vulnerable for testing purposes**

- VMs should be on isolated network segments
- Do NOT connect to production networks
- Use snapshots to quickly restore clean state
- Keep VMs up to date for realistic testing

## Cloning VMs for Multiple Targets

**VMware:**
- Right-click VM → Manage → Clone
- Choose "Linked clone" (saves disk space) or "Full clone"
- Update IP address in cloned VM

**VirtualBox:**
- Right-click VM → Clone
- Select "Linked clone" or "Full clone"
- Generate new MAC addresses
- Update IP address in cloned VM

## Exporting Template (OVA)

Once configured, export your VM for easy redistribution:

**VMware:**
- File → Export to OVF/OVA
- Choose OVA format (single file)

**VirtualBox:**
- File → Export Appliance
- Select OVF 2.0 format

Store exported templates in `vmware-virtualbox/` directory.

## VM Hardening (Optional)

For more realistic EDR testing:
- **Windows Defender**: Pre-installed, can be enabled/disabled via setup script
- **Wazuh Agent**: Optional installation via Linux setup script
- **Firewall**: Configured by setup scripts with C2 exceptions
- **Audit Logging**: Enabled by default (process, registry, file, network events)
