# Wazuh EDR Integration

Wazuh provides endpoint detection and response (EDR) capabilities, monitoring systems for security events and threats.

## Technology

- **SIEM**: Wazuh 4.x
- **Indexer**: OpenSearch (Elasticsearch fork)
- **Dashboard**: Wazuh Dashboard (Kibana fork)
- **Agents**: Wazuh agent on monitored endpoints

## Components

### Wazuh Manager
Central server that receives, analyzes, and stores security events from agents.

### Wazuh Indexer
OpenSearch-based indexer for storing and querying security data.

### Wazuh Dashboard
Web interface for visualizing security events, alerts, and compliance data.

### Wazuh Agents
Lightweight agents deployed on endpoints to collect security data.

## Integration with Gla1v3

Gla1v3 integrates with Wazuh to correlate agent activity with EDR alerts:

1. **EDR Proxy**: Backend queries Wazuh API through authenticated proxy
2. **Alert Correlation**: Match Wazuh alerts with Gla1v3 agent IDs
3. **Detection Visibility**: Operators see which actions triggered EDR alerts
4. **Purple Team Use**: Validate detection capabilities against offensive actions

## Alert Flow

1. Wazuh agent on endpoint detects suspicious activity
2. Event sent to Wazuh Manager for analysis
3. Manager applies rules and generates alert
4. Alert indexed in OpenSearch
5. Gla1v3 backend queries alerts via Wazuh API
6. Alerts displayed in Gla1v3 dashboard with agent correlation

## Detection Types

- **File Integrity Monitoring (FIM)**
- **Rootkit Detection**
- **Log Analysis**
- **Vulnerability Detection**
- **Configuration Assessment**
- **Incident Response**
- **Regulatory Compliance**

## Configuration

Wazuh is configured to:
- Monitor endpoint security events
- Apply MITRE ATT&CK mapping
- Generate alerts based on severity
- Store data for forensic analysis
- Provide API access for Gla1v3 integration

## Use Cases

### Purple Team Operations
- Deploy Gla1v3 agent on test system
- Execute tasks through C2 framework
- Monitor Wazuh for detection alerts
- Tune detection rules based on results
- Validate security controls

### Detection Validation
- Test if specific techniques trigger alerts
- Identify detection gaps
- Measure response times
- Assess alert quality and accuracy
