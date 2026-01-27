# GLA1V3 E2E Manual Test Checklist

## Quick Verification Commands

Run these in PowerShell to manually check each step of the alert pipeline.

### 1. Check Wazuh for Recent Alerts
```powershell
# View last 5 alerts in alerts.json
docker exec wazuh-edr sh -c "tail -5 /var/ossec/logs/alerts/alerts.json"
```

### 2. Check OpenSearch Alert Count
```powershell
# Show total document count in wazuh-alerts index
docker exec opensearch curl -s http://localhost:9200/wazuh-alerts-2026-01-15/_count | ConvertFrom-Json | Select-Object count
```

### 3. Check Backend API Response
```powershell
# Fetch latest alerts from API
docker exec backend curl -s http://localhost:3000/api/alerts/recent | ConvertFrom-Json
```

### 4. Check Backend Logs for Task Processing
```powershell
# Show last 20 lines of backend logs
docker logs backend --tail 20
```

### 5. Check Dashboard
- Navigate to: https://gla1v3.local/
- Login: admin / admin
- Go to "EDR Alerts" tab
- Verify alerts are displayed

---

## Manual Test Procedure

### Step 1: Baseline Check
Run all 5 commands above and note the current state (number of alerts, etc.)

### Step 2: Send Task from Dashboard
- Login to https://gla1v3.local/ (admin/admin)
- Find Agent 001 (ubuntu-target)
- Click "Add Task"
- Select "System Info"
- Click "Send Task"

### Step 3: Monitor Agent Execution
```powershell
# Watch backend logs for agent beacon and task execution
docker logs -f backend --tail 50
# Watch for: "BEACON" message and task queuing
# Press Ctrl+C when you see the agent beacon
```

### Step 4: Check Alert Generation
```powershell
# Watch for new alerts in Wazuh
docker exec -it wazuh-edr tail -f /var/ossec/logs/alerts/alerts.json
# Wait 10-30 seconds, should see task execution alert
# Press Ctrl+C when alert appears
```

### Step 5: Verify Pipeline
```powershell
# Re-run commands 1-5 from above
# Should see:
# - New alert in alerts.json
# - Increased count in OpenSearch
# - New alert in API response
# - Updated logs showing indexing
# - Alert in Dashboard EDR Alerts tab
```

---

## Expected Results

After sending a task:
- ✓ Agent receives task within 10-30 seconds
- ✓ Wazuh detects task execution and generates alert (5-15 seconds)
- ✓ Alert appears in alerts.json
- ✓ Backend indexer processes alert (every 10 seconds)
- ✓ OpenSearch count increases
- ✓ API returns the new alert
- ✓ Dashboard displays alert in EDR Alerts tab

---

## Next: Full E2E Verification

1. Send a test task from dashboard
2. Manually run Step 1-5 commands above
3. Document timestamps and verify complete flow
4. Confirm alert appears in dashboard within ~30 seconds