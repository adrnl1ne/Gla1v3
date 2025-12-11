# Wazuh EDR - Customer Environment Simulation

This directory contains the **separate Wazuh EDR environment** that simulates a customer's infrastructure. The C2 framework integrates with this via the EDR Proxy for secure, audited access.

## Architecture

```
┌─────────────────────────────────────────┐
│         C2 Infrastructure               │
│  ┌──────────┐      ┌──────────────┐     │
│  │ Backend  │─────▶│  EDR Proxy   │────┼───┐
│  │ (Admin)  │      │ (Security)   │     │   │
│  └──────────┘      └──────────────┘     │   │
└─────────────────────────────────────────┘   │
                                              │ Secure API
                                              │ (JWT + Rate Limit)
┌─────────────────────────────────────────┐   │
│      Customer EDR Environment           │   │
│  ┌──────────────────────────────────┐   │   │
│  │       Wazuh Manager              │◀──┘   │
│  │  - Rules: /var/ossec/etc/rules   │       │
│  │  - API: Port 55000               │       │
│  │  - Agent Port: 1514/1515         │       │
│  └──────────────────────────────────┘       │
│  ┌──────────────────────────────────┐       │
│  │      Target VM (Test Agent)      │       │
│  │  - Wazuh Agent: Port 1514        │       │
│  │  - C2 Beacon: Port 4443          │       │
│  └──────────────────────────────────┘       │
└─────────────────────────────────────────┘
```

## Security Isolation

**Why Separate?**
- Simulates real-world customer EDR environment
- Isolated network and data
- C2 cannot directly access - must go through EDR Proxy
- Different credentials and access controls

## Quick Start

### 1. Start Wazuh EDR (Customer Environment)
```powershell
cd infra/wazuh
docker compose up -d
```

### 2. Verify Wazuh is running
```powershell
docker logs wazuh-edr --tail 50

# Should see:
# "Wazuh API is ready"
# "Listening on port 55000"
```

### 3. Start Main C2 Infrastructure
```powershell
cd ../
docker compose up -d
```

## Custom Rules Deployment

### Via C2 Backend API (Recommended - Secure & Audited)

The backend can deploy custom detection rules through the EDR Proxy:

```bash
# Upload custom rule (requires admin JWT token)
curl -X POST https://api.gla1v3.local/api/wazuh/rules \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "edrId": "wazuh-default",
    "ruleId": "100001",
    "ruleXml": "<group name=\"custom\"><rule id=\"100001\" level=\"10\"><description>Mimikatz Detection</description><match>mimikatz|sekurlsa</match></rule></group>",
    "description": "Detect credential dumping"
  }'

# Restart Wazuh to apply changes
curl -X POST https://api.gla1v3.local/api/wazuh/restart \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"edrId": "wazuh-default"}'
```

### Shared Rules Directory

The `./wazuh-rules/` directory is shared between:
- **C2 Backend**: Writes rules to `/wazuh-rules/custom_*.xml`
- **Wazuh Container**: Reads from `/var/ossec/etc/rules/custom/`

This allows the C2 to deploy rules that Wazuh automatically loads on restart.

### Manual Rule Deployment (Testing Only)

```bash
# Create rule file locally
cat > wazuh-rules/custom_test.xml << 'EOF'
<group name="test">
  <rule id="100002" level="10">
    <description>Test rule</description>
    <match>test_pattern</match>
  </rule>
</group>
EOF

# Restart Wazuh to load
docker restart wazuh-edr
```

## API Credentials

**Default Credentials** (⚠️ Change in production):
- Username: `wazuh-wui`
- Password: `wazuh-wui`

**Update in Wazuh docker-compose.yml:**
```yaml
environment:
  - WAZUH_API_USER=your_secure_username
  - WAZUH_API_PASSWORD=your_secure_password
```

**Also update in C2 backend docker-compose.yml:**
```yaml
environment:
  - WAZUH_USER=your_secure_username
  - WAZUH_PASS=your_secure_password
```

### 4. Register Wazuh Agent on Target VM
On your test VM:
```bash
sudo /var/ossec/bin/agent-auth -m <C2_SERVER_IP> -p 1515
sudo systemctl restart wazuh-agent
```

### 5. Verify Integration
Check that C2 backend can query Wazuh:
```powershell
# Get Wazuh API token
curl -u wazuh-wui:wazuh-wui -k -X GET "http://localhost:55000/security/user/authenticate?raw=true"

# List agents
curl -k -X GET "http://localhost:55000/agents" -H "Authorization: Bearer <token>"
```

## Configuration

The C2 backend connects to Wazuh using these environment variables (set in main `docker-compose.yml`):
- `WAZUH_URL=http://host.docker.internal:55000`
- `WAZUH_USER=wazuh-wui`
- `WAZUH_PASS=wazuh-wui`

## Custom Detection Rules

Place custom rules in `wazuh-rules/local_rules.xml` and deploy:
```powershell
docker cp wazuh-rules/local_rules.xml wazuh-edr:/var/ossec/etc/rules/local_rules.xml
docker exec wazuh-edr /var/ossec/bin/wazuh-control restart
```

## Troubleshooting

### Check Wazuh logs
```powershell
docker logs wazuh-edr --tail 50
docker exec wazuh-edr cat /var/ossec/logs/ossec.log
```

### Check registered agents
```powershell
docker exec wazuh-edr /var/ossec/bin/agent_control -l
```

### Restart Wazuh
```powershell
docker compose restart wazuh-manager
```

## Stopping

```powershell
docker compose down
# To also remove the volume with stored alerts:
# docker compose down -v
```
