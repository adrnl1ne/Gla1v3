# Wazuh EDR - All-in-One Setup

This directory contains the **Wazuh all-in-one infrastructure** integrated with OpenSearch for alert indexing and the C2 backend for secure access.

## Architecture

```
┌──────────────────────────────────────────┐
│      Wazuh All-in-One (4.8.2)            │
│  ┌─────────────────────────────────────┐ │
│  │  • Wazuh Manager                    │ │
│  │  • Wazuh Filebeat                   │ │
│  │  • Wazuh Dashboard (8443)           │ │
│  │  • Wazuh API (55000)                │ │
│  └─────────────────────────────────────┘ │
│              ↓                            │
│  ┌─────────────────────────────────────┐ │
│  │      OpenSearch 2.11.1              │ │
│  │  (Alert Indexing & Storage)         │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
              ↓
┌──────────────────────────────────────────┐
│    C2 Backend (Alert Retrieval)          │
│  Query: /api/alerts/recent               │
│  Source: OpenSearch indices              │
└──────────────────────────────────────────┘
```

## Quick Start

### 1. Start Wazuh + OpenSearch
```powershell
cd infra/wazuh
docker compose up -d
```

### 2. Verify services are running
```powershell
docker compose ps
# Should show: wazuh (running), opensearch (running), wazuh-indexer (running)
```

### 3. Start Main C2 Infrastructure (from parent directory)
```powershell
cd ..
docker compose up -d
```

## Access

- **Wazuh API**: https://localhost:55001 (user: `wazuh` / pass: `wazuh`)
- **Wazuh Dashboard**: https://localhost:8443 (accessed via all-in-one container)
- **OpenSearch**: http://localhost:9200 (admin / SecretPassword123!)
- **C2 API Alerts**: https://api.gla1v3.local/api/alerts/recent

## Alert Flow

1. **Wazuh Agent** → sends logs to **Wazuh Manager** (port 1514)
2. **Wazuh Manager** → analyzes logs, generates alerts
3. **Filebeat** → ships alerts to **OpenSearch** (embedded in all-in-one)
4. **Wazuh Indexer** → monitors alert files, ensures indexing
5. **C2 Backend** → queries OpenSearch, exposes via `/api/alerts/recent`

## Agent Enrollment

Agents connect via Wazuh authd (port 1515):

```bash
# On agent VM
sudo /var/ossec/bin/agent-control -i
# Or auto-enroll: /var/ossec/bin/wazuh-control start
```

## Custom Rules

Rules are stored in `./wazuh-rules/` and automatically loaded by Wazuh:

```xml
<!-- wazuh-rules/custom_detection.xml -->
<group name="custom">
  <rule id="100001" level="7">
    <description>Custom detection rule</description>
    <match>pattern_to_detect</match>
    <mitre>
      <id>T1234</id>
    </mitre>
  </rule>
</group>
```

## Troubleshooting

### Agents not connecting
Check Wazuh manager logs:
```bash
docker compose logs wazuh --tail 50
```

### No alerts appearing
1. Verify agent can reach manager on port 1514
2. Check agent logs on the target VM
3. Verify OpenSearch is receiving alerts: `curl http://localhost:9200/_cat/indices`

### OpenSearch connection issues
If backend can't reach OpenSearch, check:
- Network: backend and opensearch must be on same `wazuh-net` or accessible via DNS
- Credentials: Update OPENSEARCH_URL and auth method in `infra/.env`
- Port: OpenSearch runs on 9200 (internal to containers)

## Files

- `docker-compose.yml` - Wazuh + OpenSearch + Indexer services
- `wazuh-config/wazuh-indexer.sh` - Script that monitors alerts and indexes to OpenSearch
- `wazuh-rules/` - Custom Wazuh detection rules (auto-loaded)
