# GLA1V3 Quick Reference - Security Features

## 🔐 Authentication

### Login
```bash
curl -X POST https://api.gla1v3.local/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'

# Response includes:
# - token: JWT bearer token (1h expiration)
# - user: {userId, username, role}
# - session: {sessionId, expiresAt}
# - certificate: {cert, key, caCert} for mTLS
```

### Logout
```bash
curl -X POST https://api.gla1v3.local/api/auth/logout \
  -H "Authorization: Bearer <token>"
```

### Refresh Token
```bash
curl -X POST https://api.gla1v3.local/api/auth/refresh \
  -H "Authorization: Bearer <token>"
```

## 👥 User Management (Admin Only)

### Create User
```bash
curl -X POST https://api.gla1v3.local/api/users \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "operator1",
    "password": "SecurePass123!",
    "role": "operator"
  }'
```

### List Users
```bash
curl https://api.gla1v3.local/api/users \
  -H "Authorization: Bearer <admin_token>"
```

## 🎯 EDR Management

### Add EDR Configuration
```bash
curl -X POST https://api.gla1v3.local/api/edr-configs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Wazuh",
    "type": "wazuh",
    "url": "https://wazuh.example.com:55000",
    "user": "api-user",
    "pass": "api-password",
    "enabled": true
  }'
```

### List EDR Configs
```bash
curl https://api.gla1v3.local/api/edr-configs \
  -H "Authorization: Bearer <token>"
```

### Update EDR
```bash
curl -X PUT https://api.gla1v3.local/api/edr-configs/<edr-id> \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

### Delete EDR
```bash
curl -X DELETE https://api.gla1v3.local/api/edr-configs/<edr-id> \
  -H "Authorization: Bearer <admin_token>"
```

## 📊 Alerts & Monitoring

### Get Recent Alerts (All EDRs)
```bash
curl https://api.gla1v3.local/api/alerts/recent \
  -H "Authorization: Bearer <token>"
```

### Get Alerts from Specific EDR
```bash
curl https://api.gla1v3.local/api/alerts/recent?edr=wazuh-default \
  -H "Authorization: Bearer <token>"
```

## 🛡️ Wazuh Rules Management (Admin Only)

### Upload Custom Rule
```bash
curl -X POST https://api.gla1v3.local/api/wazuh/rules \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "edrId": "wazuh-default",
    "ruleId": "100001",
    "ruleXml": "<group name=\"custom\"><rule id=\"100001\" level=\"10\"><description>Detect Mimikatz</description><match>mimikatz</match></rule></group>",
    "description": "Credential dumping detection"
  }'
```

### List Deployed Rules
```bash
curl https://api.gla1v3.local/api/wazuh/rules?edrId=wazuh-default \
  -H "Authorization: Bearer <token>"
```

### Restart Wazuh (Apply Rules)
```bash
curl -X POST https://api.gla1v3.local/api/wazuh/restart \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"edrId": "wazuh-default"}'
```

## 🔑 Certificate Management

### Generate Session Certificate
```bash
curl -X POST https://ca.gla1v3.local/generate-cert \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "operator1",
    "sessionId": "abc123",
    "role": "operator",
    "ttl": 3600
  }'
```

### Check Certificate Status
```bash
curl https://ca.gla1v3.local/check-cert/<certId>
```

### List Active Certificates
```bash
curl https://ca.gla1v3.local/certs
```

### Revoke Certificate
```bash
curl -X POST https://ca.gla1v3.local/revoke-cert \
  -H "Content-Type: application/json" \
  -d '{
    "certId": "<certId>",
    "reason": "User terminated"
  }'
```

### Get CRL
```bash
curl https://ca.gla1v3.local/crl
```

## 📝 Audit Logging (Admin Only)

### View Recent Audit Logs
```bash
curl 'https://api.gla1v3.local/api/audit?limit=100&offset=0' \
  -H "Authorization: Bearer <admin_token>"
```

### View EDR Proxy Audit Logs
```bash
curl 'https://edr-proxy.gla1v3.local/audit?limit=50' \
  -H "Authorization: Bearer <admin_token>"
```

## 🤖 Agent Management

### Get All Agents
```bash
curl https://api.gla1v3.local/api/agents \
  -H "Authorization: Bearer <token>"
```

### Create Task for Agent
```bash
curl -X POST https://api.gla1v3.local/api/agents/<agentId>/tasks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "cmd": "execute",
    "args": ["whoami"]
  }'
```

### Get Agent Tasks
```bash
curl https://api.gla1v3.local/api/agents/<agentId>/tasks \
  -H "Authorization: Bearer <token>"
```

## 🔧 System Maintenance

### Check Service Health
```bash
# Backend
curl https://api.gla1v3.local/health

# EDR Proxy
docker exec edr-proxy curl http://localhost:3002/health

# CA Service
docker exec ca-service curl http://localhost:3003/health

# Wazuh
docker exec wazuh-edr /var/ossec/bin/wazuh-control status
```

### View Service Logs
```bash
# All services
docker compose logs -f

# Specific service
docker logs backend --tail 100 -f
docker logs ca-service --tail 50
docker logs edr-proxy --tail 50
docker logs wazuh-edr --tail 100
```

### Restart Services
```bash
# Single service
docker restart backend

# All C2 services (keeps Wazuh running)
cd infra
docker compose restart

# Complete restart
docker compose down
docker compose up -d
```

## 🔒 Security Operations

### Force Logout All Users
```bash
# Get active sessions
curl https://api.gla1v3.local/api/audit \
  -H "Authorization: Bearer <admin_token>" \
  | grep LOGIN_SUCCESS

# Restart backend (invalidates all tokens)
docker restart backend

# Revoke all certificates
docker exec ca-service rm -rf /certs/sessions/*
```

### Rotate JWT Secret
```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -hex 32)

# 2. Update docker-compose.yml
# JWT_SECRET=$NEW_SECRET

# 3. Restart services
docker compose down
docker compose up -d

# All users must re-login
```

### Emergency EDR Disconnect
```bash
# Disable all EDRs immediately
curl -X PUT https://api.gla1v3.local/api/edr-configs/<edr-id> \
  -H "Authorization: Bearer <admin_token>" \
  -d '{"enabled": false}'

# Or stop EDR proxy
docker stop edr-proxy
```

## 📊 Monitoring & Alerts

### Failed Login Attempts
```bash
docker logs backend | grep "LOGIN_FAILED"
```

### Rate Limit Violations
```bash
docker logs edr-proxy | grep "RATE_LIMIT_EXCEEDED"
```

### Unauthorized Access Attempts
```bash
docker logs backend | grep "AUTH_FAILURE"
docker logs edr-proxy | grep "AUTH_FAILURE"
```

### Certificate Revocations
```bash
docker logs ca-service | grep "Certificate revoked"
```

## 🚨 Incident Response

### Suspected Compromise

1. **Isolate**:
```bash
docker compose down
```

2. **Preserve Evidence**:
```bash
docker logs backend > backend-$(date +%Y%m%d).log
docker logs edr-proxy > edr-proxy-$(date +%Y%m%d).log
docker logs ca-service > ca-$(date +%Y%m%d).log
```

3. **Audit Review**:
```bash
curl https://api.gla1v3.local/api/audit?limit=1000 \
  -H "Authorization: Bearer <admin_token>" \
  > audit-$(date +%Y%m%d).json
```

4. **Rotate All Secrets**:
- JWT_SECRET
- INTERNAL_TOKEN
- WAZUH credentials
- Admin password

5. **Rebuild**:
```bash
docker compose down -v
docker compose up -d --build
```

## 📞 Support Contacts

- Security Issues: security@gla1v3.local
- Documentation: [docs/SECURITY.md](../docs/SECURITY.md)
- GitHub Issues: https://github.com/yourusername/Gla1v3/issues

---

**Last Updated**: 2025-12-11  
**Version**: 1.0.0
