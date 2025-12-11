# EDR Management System

## Overview

The GLA1V3 C2 framework now supports dynamic EDR configuration management, allowing you to add, modify, and remove EDR integrations for different testing scenarios.

## Features

### 1. **Dynamic EDR Configuration**
- Add multiple EDR instances (Wazuh, CrowdStrike, SentinelOne, etc.)
- Configure API endpoints, credentials, and enable/disable on the fly
- No need to restart containers or modify environment variables

### 2. **Multi-EDR Support**
- Query alerts from multiple EDRs simultaneously
- Each alert tagged with its source EDR
- Filter alerts by specific EDR or view all

### 3. **Frontend UI**
Access the EDR management interface through the Dashboard:
- **EDR Config Tab**: Manage EDR configurations
- **EDR Alerts Tab**: View and filter alerts by EDR source

## Usage

### Adding a New EDR

1. Navigate to Dashboard → **EDR Config** tab
2. Click **+ Add EDR**
3. Fill in the configuration:
   - **Name**: Descriptive name (e.g., "Wazuh Production")
   - **Type**: EDR type (wazuh, crowdstrike, sentinelone, other)
   - **API URL**: Full API endpoint (e.g., `https://wazuh.example.com:55000`)
   - **Username**: API username (optional)
   - **Password**: API password (optional)
   - **Enabled**: Toggle to enable/disable
4. Click **Create**

### Editing an EDR Configuration

1. In the EDR Config tab, click **Edit** next to the EDR
2. Modify the fields (leave password blank to keep current password)
3. Click **Update**

### Deleting an EDR Configuration

1. In the EDR Config tab, click **Delete** next to the EDR
2. Confirm deletion

### Filtering Alerts by EDR

1. Navigate to Dashboard → **EDR Alerts** tab
2. Use the **Filter by EDR** dropdown to select:
   - **All EDRs**: View alerts from all enabled EDRs
   - **Specific EDR**: View alerts from only that EDR
3. Alerts display with an EDR badge showing the source

## API Endpoints

### EDR Configuration Management

#### Get All EDR Configs
```bash
GET /api/edr-configs
```

Response:
```json
[
  {
    "id": "wazuh-default",
    "name": "Wazuh EDR",
    "type": "wazuh",
    "url": "https://host.docker.internal:55000",
    "user": "wazuh-wui",
    "pass": "***",
    "enabled": true,
    "createdAt": "2025-12-11T..."
  }
]
```

#### Get Single EDR Config
```bash
GET /api/edr-configs/:id
```

#### Create EDR Config
```bash
POST /api/edr-configs
Content-Type: application/json

{
  "name": "My EDR",
  "type": "wazuh",
  "url": "https://edr.example.com:55000",
  "user": "admin",
  "pass": "password",
  "enabled": true
}
```

#### Update EDR Config
```bash
PUT /api/edr-configs/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "enabled": false
}
```

#### Delete EDR Config
```bash
DELETE /api/edr-configs/:id
```

### Alert Retrieval

#### Get Recent Alerts (All EDRs)
```bash
GET /api/alerts/recent
```

#### Get Recent Alerts (Filtered by EDR)
```bash
GET /api/alerts/recent?edr=wazuh-default
```

Response:
```json
[
  {
    "edrId": "wazuh-default",
    "edrName": "Wazuh EDR",
    "timestamp": "2025-12-11T10:30:45.123Z",
    "agent": "ubuntu-vm",
    "ruleId": "5712",
    "description": "Suspicious file modification detected",
    "level": 10,
    "mitre": {
      "tactics": ["Defense Evasion"],
      "techniques": ["T1070"]
    }
  }
]
```

## Architecture

### Backend (Node.js)

- **In-Memory Storage**: EDR configs stored in Map (can be persisted to file/DB)
- **Default Config**: Wazuh EDR auto-initialized from environment variables
- **Multi-EDR Queries**: Alerts aggregated from all enabled EDRs
- **Extensible**: Easy to add support for new EDR types

### Frontend (React)

- **EDRManager Component**: Full CRUD interface for EDR configs
- **AlertTable Component**: Enhanced with EDR filtering
- **Dashboard Integration**: New tab for EDR management

## Supported EDR Types

Currently implemented:
- ✅ **Wazuh** - Full support for alert retrieval via API

Planned/extensible:
- 🔄 **CrowdStrike** - API integration structure ready
- 🔄 **SentinelOne** - API integration structure ready
- 🔄 **Custom/Other** - Generic type for custom integrations

## Testing Scenarios

### Scenario 1: Single EDR
1. Keep default Wazuh configuration
2. View alerts from single EDR

### Scenario 2: Multiple Customer EDRs
1. Add EDR config for "Customer A Wazuh" with their endpoint
2. Add EDR config for "Customer B SentinelOne" with their endpoint
3. Enable both EDRs
4. Switch between customers using the filter dropdown
5. View all customer alerts in aggregate

### Scenario 3: Testing with Disabled EDRs
1. Disable specific EDR configs without deleting them
2. Quickly enable/disable for different test phases
3. No container restarts required

## Configuration Persistence

**Current**: In-memory storage (resets on container restart)

**To Enable Persistence**:
1. Add volume mount to backend service
2. Implement file-based storage (e.g., JSON file)
3. Load configs on startup, save on changes

Example:
```javascript
// Save to file
const fs = require('fs');
fs.writeFileSync('/app/data/edr-configs.json', JSON.stringify(Array.from(edrConfigs.entries())));

// Load from file
const data = JSON.parse(fs.readFileSync('/app/data/edr-configs.json'));
edrConfigs = new Map(data);
```

## Security Considerations

1. **Password Masking**: Passwords masked in API responses (displayed as `***`)
2. **HTTPS Enforcement**: All EDR API calls should use HTTPS
3. **TLS Verification**: Currently disabled for MVP (`rejectUnauthorized: false`)
   - Enable in production with proper certificates
4. **Access Control**: Consider adding authentication to EDR config endpoints
5. **Secrets Management**: Store EDR credentials in environment variables or secrets manager

## Troubleshooting

### EDR Configuration Not Appearing in Alerts
- Check that EDR is **Enabled** in EDR Config tab
- Verify API URL is accessible from backend container
- Check backend logs for connection errors: `docker logs backend`

### No Alerts Displayed
- Verify Wazuh/EDR is generating alerts
- Check alerts file exists: `docker exec wazuh-edr ls -la /var/ossec/logs/alerts/`
- Check file permissions if using volume mounts

### "Failed to fetch EDR configs" Error
- Ensure backend container is running: `docker ps`
- Check CORS configuration in backend
- Verify Traefik routing to backend API

## Future Enhancements

1. **Database Persistence**: Store configs in PostgreSQL/SQLite
2. **API Key Authentication**: Secure EDR config endpoints
3. **Webhook Integration**: Real-time alert push from EDRs
4. **Alert Deduplication**: Merge duplicate alerts from multiple EDRs
5. **Custom Alert Parsing**: Support different EDR alert formats
6. **Health Checks**: Monitor EDR API connectivity status
7. **Alert Statistics**: Dashboard showing alert counts per EDR

## Example: Testing with Multiple Wazuh Instances

```bash
# Add second Wazuh instance
curl -X POST https://api.gla1v3.local/api/edr-configs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wazuh Secondary",
    "type": "wazuh",
    "url": "https://wazuh2.example.com:55000",
    "user": "admin",
    "pass": "secure-password",
    "enabled": true
  }'

# Fetch alerts from both
curl https://api.gla1v3.local/api/alerts/recent

# Filter to specific instance
curl https://api.gla1v3.local/api/alerts/recent?edr=wazuh-default
```

## Contributing

To add support for a new EDR type:

1. Implement fetcher function in `backend/index.js`:
```javascript
async function fetchNewEDRAlert(edrConfig, agentId, output) {
  // Your EDR API integration here
  return {
    description: "Alert description",
    rule_id: "123",
    timestamp: new Date().toISOString()
  };
}
```

2. Update `fetchEDRAlert()` to handle new type:
```javascript
if (edrConfig.type === 'newedr') {
  return await fetchNewEDRAlert(edrConfig, agentId, output);
}
```

3. Add option to dropdown in `EDRManager.jsx`:
```jsx
<option value="newedr">New EDR</option>
```
