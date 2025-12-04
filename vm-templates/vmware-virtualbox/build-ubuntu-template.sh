#!/bin/bash
# Build Ubuntu 22.04 VM Template for Gla1v3
# Automates Ubuntu VM template creation for VMware/VirtualBox

set -e

# Default values
PLATFORM=""
ISO_PATH="${ISO_PATH:-$HOME/ISOs/ubuntu-22.04-live-server-amd64.iso}"
OUTPUT_PATH="${OUTPUT_PATH:-.}"
VM_NAME="${VM_NAME:-Gla1v3-Ubuntu-Target}"
RAM_SIZE="${RAM_SIZE:-2048}"
CPUS="${CPUS:-2}"
DISK_SIZE="${DISK_SIZE:-25}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --vmware)
            PLATFORM="vmware"
            shift
            ;;
        --virtualbox)
            PLATFORM="virtualbox"
            shift
            ;;
        --iso)
            ISO_PATH="$2"
            shift 2
            ;;
        --name)
            VM_NAME="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate platform
if [ -z "$PLATFORM" ]; then
    echo "Error: Please specify either --vmware or --virtualbox"
    exit 1
fi

# Validate ISO
if [ ! -f "$ISO_PATH" ]; then
    echo "Error: Ubuntu ISO not found at: $ISO_PATH"
    echo "Download from: https://ubuntu.com/download/server"
    exit 1
fi

echo "========================================"
echo "Gla1v3 Ubuntu Template Builder"
echo "========================================"
echo ""
echo "Platform: $PLATFORM"
echo "VM Name: $VM_NAME"
echo "RAM: $RAM_SIZE MB"
echo "CPUs: $CPUS"
echo "Disk: $DISK_SIZE GB"
echo ""

# Create cloud-init user-data for automated installation
cat > user-data << 'EOF'
#cloud-config
autoinstall:
  version: 1
  locale: en_US
  keyboard:
    layout: us
  network:
    network:
      version: 2
      ethernets:
        ens33:
          dhcp4: true
  storage:
    layout:
      name: direct
  identity:
    hostname: ubuntu-target
    username: vagrant
    password: $6$rounds=4096$saltsalt$YnW5hqHqMgVHqXBP4JDhqN7QLRTqGFdBLUJ1PLxvz6HDeFBmL7p7Lz3KGgqM5fYCHJMTqQGqp4KqhZ2qPCOZ0/
  ssh:
    install-server: true
    allow-pw: true
  packages:
    - curl
    - wget
    - net-tools
    - vim
  late-commands:
    - echo 'vagrant ALL=(ALL) NOPASSWD:ALL' > /target/etc/sudoers.d/vagrant
    - chmod 440 /target/etc/sudoers.d/vagrant
EOF

# Create meta-data (required but empty)
cat > meta-data << 'EOF'
instance-id: gla1v3-ubuntu-template
local-hostname: ubuntu-target
EOF

echo "[+] Created cloud-init configuration files"

# Setup script location
SETUP_SCRIPT="../setup-linux-target.sh"
if [ ! -f "$SETUP_SCRIPT" ]; then
    echo "Error: Setup script not found at: $SETUP_SCRIPT"
    exit 1
fi

echo "[+] Found setup script: $SETUP_SCRIPT"

# Platform-specific instructions
if [ "$PLATFORM" = "vmware" ]; then
    echo ""
    echo "VMware VM Creation Steps:"
    echo "1. Open VMware Workstation/Player"
    echo "2. File → New Virtual Machine → Typical"
    echo "3. Select ISO: $ISO_PATH"
    echo "4. Guest OS: Linux → Ubuntu 64-bit"
    echo "5. VM Name: $VM_NAME"
    echo "6. Disk Size: $DISK_SIZE GB"
    echo "7. Customize Hardware:"
    echo "   - RAM: $RAM_SIZE MB"
    echo "   - CPUs: $CPUS"
    echo "   - Network: Host-only"
    echo "8. Power On VM"
    echo "9. During Ubuntu installation:"
    echo "   - Choose 'Install Ubuntu Server'"
    echo "   - Username: vagrant"
    echo "   - Password: vagrant"
    echo "   - Install OpenSSH server: Yes"
    echo "10. After installation, login and run:"
    echo "    wget https://your-server/setup-linux-target.sh"
    echo "    chmod +x setup-linux-target.sh"
    echo "    sudo C2_SERVER=YOUR_IP ./setup-linux-target.sh"
    echo "11. Install VMware Tools:"
    echo "    sudo apt update && sudo apt install -y open-vm-tools"
    echo "12. VM → Manage → Clone → Full Clone"
    echo "13. Export: File → Export to OVF"
fi

if [ "$PLATFORM" = "virtualbox" ]; then
    echo ""
    echo "VirtualBox VM Creation Steps:"
    echo "1. Open VirtualBox"
    echo "2. Machine → New"
    echo "   - Name: $VM_NAME"
    echo "   - Type: Linux"
    echo "   - Version: Ubuntu (64-bit)"
    echo "   - RAM: $RAM_SIZE MB"
    echo "   - Create virtual hard disk: VDI, $DISK_SIZE GB"
    echo "3. Settings → Storage → Add Optical Drive → $ISO_PATH"
    echo "4. Settings → Network → Adapter 1 → Host-only Adapter"
    echo "5. Start VM"
    echo "6. During Ubuntu installation:"
    echo "   - Choose 'Install Ubuntu Server'"
    echo "   - Username: vagrant"
    echo "   - Password: vagrant"
    echo "   - Install OpenSSH server: Yes"
    echo "7. After installation, login and run:"
    echo "   wget https://your-server/setup-linux-target.sh"
    echo "   chmod +x setup-linux-target.sh"
    echo "   sudo C2_SERVER=YOUR_IP ./setup-linux-target.sh"
    echo "8. Install Guest Additions:"
    echo "   Devices → Insert Guest Additions CD"
    echo "   sudo apt update && sudo apt install -y virtualbox-guest-utils"
    echo "9. File → Export Appliance → OVA Format"
fi

echo ""
echo "Automated Installation Details:"
echo "  Username: vagrant"
echo "  Password: vagrant"
echo "  SSH: Enabled"
echo "  Sudo: Passwordless for vagrant user"

echo ""
echo "After VM is created and setup is complete:"
echo "  1. Power off VM"
echo "  2. Take snapshot: 'Clean - Post Setup'"
echo "  3. Export to OVA for distribution"
echo "  4. Test by importing OVA in new VM"

echo ""
echo "Quick Setup Script (run inside VM after first boot):"
echo "---"
cat << 'QUICKSETUP'
#!/bin/bash
# Quick setup for Gla1v3 Ubuntu target

# Download and run setup
wget -O /tmp/setup.sh https://api.gla1v3.local/setup-linux-target.sh
chmod +x /tmp/setup.sh
sudo C2_SERVER=192.168.56.1 /tmp/setup.sh

# Or if using local copy
# sudo C2_SERVER=192.168.56.1 /path/to/setup-linux-target.sh
QUICKSETUP
echo "---"

echo ""
echo "[✓] Template builder setup complete!"
echo "Follow the steps above to create your Ubuntu VM template."

# Create a README for the generated files
cat > README-cloud-init.txt << 'EOF'
Cloud-Init Files Generated
===========================

user-data: Automated Ubuntu installation configuration
meta-data: Instance metadata (required but minimal)

These files can be used with:
1. VMware vCloud Director
2. VirtualBox with cloud-init support
3. QEMU/KVM with cloud-init
4. Packer for automated builds

For manual installation without cloud-init, ignore these files
and follow the step-by-step instructions in the main README.md
EOF

echo ""
echo "Cloud-init files generated (optional, for advanced users):"
echo "  - user-data"
echo "  - meta-data"
echo "  - README-cloud-init.txt"
