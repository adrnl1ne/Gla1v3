# Gla1v3 VM Templates for VMware & VirtualBox

Pre-configured VM templates that can be imported directly into VMware Workstation/Player or VirtualBox GUI.

## Overview

Two approaches available:
1. **Import Pre-built OVA** (recommended) - Import ready-to-use VM template
2. **Manual Setup** - Create VM from ISO and run setup script

## Option 1: Import Pre-built OVA Template

### Download Base Images
- **Windows 10**: [Windows 10 Developer VM](https://developer.microsoft.com/en-us/windows/downloads/virtual-machines/)
- **Ubuntu 22.04**: Download from `ubuntu-22.04-template.ova` (see Building Templates section)

### Import into VMware
1. Open VMware Workstation/Player
2. `File` → `Open` → Select `.ova` file
3. Choose storage location
4. Click `Import`
5. **Before starting**: Edit VM settings → Network Adapter → Set to `Host-only` or `NAT`
6. Power on VM

### Import into VirtualBox
1. Open VirtualBox
2. `File` → `Import Appliance`
3. Select `.ova` file
4. Review settings (change RAM/CPU if needed)
5. Click `Import`
6. **Before starting**: VM Settings → Network → Adapter 1 → Set to `Host-only Adapter`
7. Start VM

### First Boot Configuration

**Windows:**
```powershell
# Login credentials: vagrant/vagrant (or Administrator/password if you built it)

# Run setup script (already on Desktop if using pre-built template)
cd C:\Users\vagrant\Desktop
PowerShell -ExecutionPolicy Bypass -File .\setup-windows-target.ps1 -C2Server YOUR_C2_IP

# Or run pre-staged version if available
C:\Gla1v3\setup-windows-target.ps1 -C2Server YOUR_C2_IP
```

**Ubuntu:**
```bash
# Login credentials: vagrant/vagrant (or ubuntu/ubuntu)

# Run setup script
cd /tmp
curl -O https://api.gla1v3.local/setup-linux-target.sh
chmod +x setup-linux-target.sh
sudo C2_SERVER=YOUR_C2_IP ./setup-linux-target.sh
```

## Option 2: Manual VM Creation

### Step 1: Create New VM

**VMware:**
1. `File` → `New Virtual Machine`
2. Select `Typical` configuration
3. Choose installer disc image (ISO)
   - Windows: `Windows10.iso`
   - Ubuntu: `ubuntu-22.04-desktop-amd64.iso` or `ubuntu-22.04-live-server-amd64.iso`
4. Set VM name: `Gla1v3-Windows-Target` or `Gla1v3-Ubuntu-Target`
5. Disk size: 60GB (Windows) or 25GB (Ubuntu)
6. Customize hardware:
   - RAM: 4GB (Windows) or 2GB (Ubuntu)
   - CPUs: 2
   - Network: Host-only or NAT
7. Finish and install OS

**VirtualBox:**
1. `Machine` → `New`
2. Name: `Gla1v3-Windows-Target` or `Gla1v3-Ubuntu-Target`
3. Type: Windows/Linux, Version: Windows 10 64-bit / Ubuntu 64-bit
4. RAM: 4096MB (Windows) or 2048MB (Ubuntu)
5. Create virtual hard disk: 60GB (Windows) or 25GB (Ubuntu), VDI, Dynamically allocated
6. Settings → Storage → Add optical drive → Select ISO
7. Settings → Network → Adapter 1 → Host-only Adapter
8. Start and install OS

### Step 2: OS Installation

**Windows 10:**
- Username: `vagrant` (or your preference)
- Password: `vagrant`
- Privacy settings: Disable all
- Skip Microsoft account login (use local account)

**Ubuntu:**
- Username: `vagrant`
- Password: `vagrant`
- Hostname: `ubuntu-target`
- Install OpenSSH server: Yes
- No additional software needed

### Step 3: Install Guest Additions/Tools

**VMware:**
```bash
# Ubuntu
sudo apt install open-vm-tools open-vm-tools-desktop -y

# Windows - VM menu: "Install VMware Tools"
```

**VirtualBox:**
```bash
# Ubuntu
sudo apt install virtualbox-guest-additions-iso -y

# Windows - Devices menu: "Insert Guest Additions CD"
```

### Step 4: Run Setup Script

**Windows:**
1. Download setup script:
   ```powershell
   Invoke-WebRequest -Uri "https://raw.githubusercontent.com/YOUR_REPO/Gla1v3/main/vm-templates/setup-windows-target.ps1" -OutFile "C:\setup.ps1"
   ```
2. Or use USB/shared folder to copy `setup-windows-target.ps1`
3. Run as Administrator:
   ```powershell
   PowerShell -ExecutionPolicy Bypass -File C:\setup.ps1 -C2Server YOUR_C2_IP
   ```

**Ubuntu:**
1. Download setup script:
   ```bash
   wget https://raw.githubusercontent.com/YOUR_REPO/Gla1v3/main/vm-templates/setup-linux-target.sh
   chmod +x setup-linux-target.sh
   ```
2. Or use USB/shared folder to copy `setup-linux-target.sh`
3. Run with sudo:
   ```bash
   sudo C2_SERVER=YOUR_C2_IP ./setup-linux-target.sh
   ```

### Step 5: Create Snapshot

**VMware:**
1. `VM` → `Snapshot` → `Take Snapshot`
2. Name: `Clean - Post Setup`
3. Description: `Fresh install with Gla1v3 setup completed`

**VirtualBox:**
1. `Machine` → `Take Snapshot`
2. Name: `Clean - Post Setup`
3. Description: `Fresh install with Gla1v3 setup completed`

## Building Your Own OVA Template

### Create Template from Configured VM

**VMware:**
```powershell
# Export to OVA
# VM menu: File → Export to OVF
# Choose location: vm-templates/vmware-virtualbox/
# Name: Gla1v3-Windows-Target.ova or Gla1v3-Ubuntu-Target.ova
# Format: OVA (single file)
```

**VirtualBox:**
```powershell
# Export to OVA
# File → Export Appliance
# Select VM
# Format: OVF 2.0
# Write Manifest file: Yes
# Save as: Gla1v3-Windows-Target.ova or Gla1v3-Ubuntu-Target.ova
```

### Automate with Scripts

**Build Windows Template:**
```powershell
cd vm-templates\vmware-virtualbox
.\build-windows-template.ps1 -VMWare  # or -VirtualBox
```

**Build Ubuntu Template:**
```bash
cd vm-templates/vmware-virtualbox
./build-ubuntu-template.sh --vmware  # or --virtualbox
```

## Network Configuration

### Recommended Network Setup

**Host-Only Network (Isolated Testing):**
- VMware: `Edit` → `Virtual Network Editor` → VMnet1 (Host-only)
  - Subnet: `192.168.56.0/24`
  - DHCP: Disabled (use static IPs)
- VirtualBox: `File` → `Host Network Manager`
  - Adapter: `vboxnet0`
  - IPv4: `192.168.56.1/24`
  - DHCP: Disabled

**Assign Static IPs:**
- C2 Server: `192.168.56.1`
- Windows Target: `192.168.56.10`
- Ubuntu Target: `192.168.56.11`

**NAT Network (Internet Access):**
- Use when VMs need to download updates/packages
- Both VMware and VirtualBox support NAT networking
- C2 server should be on same NAT network or use bridged adapter

## Cloning VMs

### Quick Clone for Multiple Targets

**VMware:**
1. Right-click VM → `Manage` → `Clone`
2. Clone from: `Current state` (or snapshot)
3. Clone type: `Linked clone` (saves disk space) or `Full clone`
4. Name: `Gla1v3-Target-01`, `Gla1v3-Target-02`, etc.
5. Update IP in each clone

**VirtualBox:**
1. Right-click VM → `Clone`
2. Name: `Gla1v3-Target-01`
3. MAC Address Policy: `Generate new MAC addresses`
4. Clone type: `Linked clone` or `Full clone`
5. Update IP in each clone

### Update IP in Cloned VM

**Windows:**
```powershell
# Set static IP
New-NetIPAddress -InterfaceAlias "Ethernet0" -IPAddress "192.168.56.20" -PrefixLength 24 -DefaultGateway "192.168.56.1"
Set-DnsClientServerAddress -InterfaceAlias "Ethernet0" -ServerAddresses "8.8.8.8","8.8.4.4"
```

**Ubuntu:**
```bash
# Edit netplan
sudo nano /etc/netplan/01-netcfg.yaml

# Set static IP
network:
  version: 2
  ethernets:
    ens33:  # or eth0
      addresses: [192.168.56.21/24]
      gateway4: 192.168.56.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]

sudo netplan apply
```

## Testing Workflow

1. **Import/Clone VM** → Start VM from template
2. **Take Snapshot** → `Clean State` before any agent deployment
3. **Deploy Agent** → Run agent deployment script
4. **Test Detection** → Trigger EDR alerts, observe Wazuh
5. **Restore Snapshot** → Return to clean state
6. **Repeat** → Test different agents/payloads

## Troubleshooting

### Can't connect to C2
```powershell
# Windows
ping c2.gla1v3.local
Test-NetConnection api.gla1v3.local -Port 443

# Ubuntu  
ping c2.gla1v3.local
curl -k https://api.gla1v3.local/health
```

### Check hosts file
```powershell
# Windows
type C:\Windows\System32\drivers\etc\hosts

# Ubuntu
cat /etc/hosts
```

### Network adapter issues
- VMware: Try switching between Host-only and NAT
- VirtualBox: Verify Host-only adapter exists in Host Network Manager
- Restart VM after network changes

### Guest additions not working
```bash
# Ubuntu - reinstall
sudo apt remove --purge virtualbox-guest-* open-vm-tools
sudo apt autoremove
# Then reinstall from Devices/VM menu
```

## Best Practices

1. **Always snapshot** after initial setup before deploying agents
2. **Use linked clones** to save disk space when creating multiple targets
3. **Disable Windows Defender** on Windows VMs for testing (optional)
4. **Keep template VMs powered off** - only run clones
5. **Document VM names and IPs** in a spreadsheet
6. **Regular template updates** - rebuild templates monthly with latest patches

## Pre-built Templates Storage

Store your built OVA files:
```
vm-templates/vmware-virtualbox/
├── Gla1v3-Windows-Target.ova      (5-8 GB)
├── Gla1v3-Ubuntu-Target.ova       (2-3 GB)
├── Gla1v3-Ubuntu-Minimal.ova      (1-2 GB)
└── checksums.txt                   (SHA256 hashes)
```

Generate checksums:
```powershell
# Windows
Get-FileHash *.ova -Algorithm SHA256 > checksums.txt

# Linux
sha256sum *.ova > checksums.txt
```
