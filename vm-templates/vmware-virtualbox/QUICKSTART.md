# Quick Start Guide - VM Templates

**Goal**: Get a working Gla1v3 target VM up and running in 15 minutes.

## Prerequisites
- VMware Workstation/Player OR VirtualBox installed
- Windows 10 ISO OR Ubuntu 22.04 ISO downloaded
- At least 8GB free RAM
- 60GB free disk space
- **Shared folder configured** (recommended for easy script transfer)
  - VMware: VM Settings → Options → Shared Folders → Add your Gla1v3 repo folder
  - VirtualBox: VM Settings → Shared Folders → Add your Gla1v3 repo folder

## Fastest Path: Manual VM Setup

### Step 1: Create VM (5 minutes)

**VMware:**
```
File → New Virtual Machine → Typical
├── ISO: Select your Windows/Ubuntu ISO
├── Name: Gla1v3-Target
├── Disk: 40GB (minimum)
├── RAM: 4GB (Windows) or 2GB (Ubuntu)
└── Network: Host-only Adapter
```

**VirtualBox:**
```
Machine → New
├── Name: Gla1v3-Target
├── Type: Windows 10 64-bit OR Ubuntu 64-bit
├── RAM: 4096MB (Windows) or 2048MB (Ubuntu)
├── Disk: 40GB VDI
├── Network: Host-only Adapter (vboxnet0)
└── Start VM with ISO attached
```

### Step 2: Install OS (5-10 minutes)

**Windows:**
- Username: `vagrant`
- Password: `vagrant`
- Skip Microsoft account
- Disable privacy settings

**Ubuntu:**
- Username: `vagrant`
- Password: `vagrant`
- Hostname: `ubuntu-target`
- Install OpenSSH server: ✓

### Step 3: Run Setup Script (2-3 minutes)

**Windows** (run as Administrator):
```powershell
# Option 1: Copy from VMware/VirtualBox shared folder
Copy-Item "\\vmware-host\Shared Folders\Gla1v3\vm-templates\setup-windows-target.ps1" -Destination "$env:TEMP\setup.ps1"
# Or for VirtualBox: Copy-Item "\\vboxsvr\Gla1v3\vm-templates\setup-windows-target.ps1" -Destination "$env:TEMP\setup.ps1"

# Option 2: Download from local C2 server (if backend is serving static files)
# Invoke-WebRequest -Uri "http://192.168.56.1:3000/setup-windows-target.ps1" -OutFile "$env:TEMP\setup.ps1"

# Option 3: Copy from USB/mounted drive
# Copy-Item "E:\setup-windows-target.ps1" -Destination "$env:TEMP\setup.ps1"

# Run setup
PowerShell -ExecutionPolicy Bypass -File "$env:TEMP\setup.ps1" -C2Server 192.168.56.1
```

**Ubuntu:**
```bash
# Option 1: Copy from VMware shared folder
sudo cp /mnt/hgfs/Gla1v3/vm-templates/setup-linux-target.sh /tmp/setup.sh
# Or for VirtualBox: sudo cp /media/sf_Gla1v3/vm-templates/setup-linux-target.sh /tmp/setup.sh

# Option 2: Download from local C2 server (if backend is serving static files)
# wget http://192.168.56.1:3000/setup-linux-target.sh -O /tmp/setup.sh

# Option 3: Use SCP from Windows host (if SSH is enabled)
# From Windows: scp C:\Users\YourUser\source\repos\Gla1v3\vm-templates\setup-linux-target.sh vagrant@192.168.56.11:/tmp/setup.sh

# Run setup
chmod +x /tmp/setup.sh
sudo C2_SERVER=192.168.56.1 /tmp/setup.sh
```

### Step 4: Take Snapshot (1 minute)

**VMware:**
```
VM → Snapshot → Take Snapshot
Name: "Clean - Ready for Agent Deployment"
```

**VirtualBox:**
```
Machine → Take Snapshot
Name: "Clean - Ready for Agent Deployment"
```

## Done! 🎉

Your VM is now ready for agent deployment.

---

## Alternative: Import Pre-built OVA (If Available)

If you have a pre-built OVA template:

**VMware:**
```
File → Open → Select .ova file → Import
```

**VirtualBox:**
```
File → Import Appliance → Select .ova file → Import
```

Configure IP and C2 server:
```powershell
# Windows
C:\Gla1v3\setup-windows-target.ps1 -C2Server YOUR_C2_IP

# Linux
sudo C2_SERVER=YOUR_C2_IP /opt/gla1v3/setup-linux-target.sh
```

---

## Network Setup

Ensure C2 server and VMs are on same network:

**Recommended Setup:**
- C2 Server: `192.168.56.1`
- VM Network: Host-only (`192.168.56.0/24`)
- Windows Target: `192.168.56.10`
- Ubuntu Target: `192.168.56.11`

**Configure Host-Only Network:**

VMware:
```
Edit → Virtual Network Editor
├── VMnet1 (Host-only)
├── Subnet: 192.168.56.0/24
└── DHCP: Disabled
```

VirtualBox:
```
File → Host Network Manager → Create
├── Adapter: vboxnet0
├── IPv4: 192.168.56.1/24
└── DHCP: Disabled
```

---

## Deploy Agent (After Setup Complete)

**Windows:**
```powershell
# From dashboard or manual download
C:\Gla1v3\agents\deploy-agent.ps1 -AgentType main
```

**Ubuntu:**
```bash
sudo /opt/gla1v3/agents/deploy-agent.sh main
```

---

## Troubleshooting

### Can't reach C2 server
```bash
# Test connectivity
ping c2.gla1v3.local

# Check hosts file
# Windows: type C:\Windows\System32\drivers\etc\hosts
# Linux: cat /etc/hosts

# Should contain:
# 192.168.56.1 c2.gla1v3.local api.gla1v3.local
```

### VM network not working
- Verify Host-only adapter exists
- Check VM network adapter settings
- Restart VM networking service

### Setup script fails
- Run as Administrator (Windows) or sudo (Linux)
- Check PowerShell execution policy: `Set-ExecutionPolicy Bypass -Scope Process`
- Verify C2_SERVER IP is correct

---

## Next Steps

1. **Clone VM** for multiple targets
2. **Test agent deployment** from dashboard
3. **Monitor alerts** in Wazuh
4. **Restore snapshot** after each test
5. **Repeat** with different agents/payloads

For detailed instructions, see [README.md](./README.md)
