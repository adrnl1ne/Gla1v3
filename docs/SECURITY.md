# GLA1V3 Security Architecture

## Overview

GLA1V3 implements a comprehensive defense-in-depth security architecture addressing key threat vectors for C2 frameworks:

- **Authentication**: JWT-based session management with role-based access control (RBAC)
- **Transport Security**: mTLS for all inter-service and agent communication
- **Dynamic Certificates**: Session-based certificate generation with auto-expiration
- **EDR Isolation**: Proxy service isolates C2 from customer EDR systems
- **Audit Trail**: Immutable logging of all security-relevant actions
- **Integrity Protection**: Cryptographic validation of Wazuh rules

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Operators                            │
└────────────┬────────────────────────────────────────────────┘
             │ HTTPS + JWT
             ↓
┌────────────────────────────────────────────────────────────┐
│  Traefik (Reverse Proxy)                                   │
│  - TLS termination                                         │
│  - mTLS for agents (port 4443)                             │
└─┬─────────┬──────────┬──────────────────────┬──────────────┘
  │         │          │                      │
  │ JWT     │ mTLS     │ JWT                 │ Internal
  ↓         ↓          ↓                      ↓
┌─────┐ ┌──────┐ ┌──────────┐ ┌──────────────────────┐
│Front│ │ C2   │ │  EDR     │ │  Certificate         │
│ end │ │Backend││  Proxy   │ │  Authority (CA)      │
└─────┘ └───┬──┘ └────┬─────┘ └──────────────────────┘
            │         │ mTLS
            │         ↓
            │    ┌─────────────┐
            │    │  Wazuh EDR  │
            │    │  (Customer) │
            │    └─────────────┘
            ↓
      ┌──────────┐
      │  Agents  │
      │  (mTLS)  │
      └──────────┘
```

## Components

### 1. JWT Authentication System

**Location**: `backend/index.js`

**Features**:
- User authentication with bcrypt password hashing
- JWT token generation with configurable expiration
- Role-based access control (RBAC): `admin`, `operator`
- Session tracking with revocation support
- Token refresh mechanism

**Endpoints**:
- `POST /api/auth/login` - Authenticate and receive JWT token
- `POST /api/auth/logout` - Invalidate session and revoke certificates
- `POST /api/auth/refresh` - Refresh token before expiration
- `POST /api/users` - Create new user (admin only)
- `GET /api/users` - List all users (admin only)

**Default Credentials**:
```
Username: admin
Password: admin
```

**⚠️ SECURITY**: Change default password immediately after deployment!

### 2. Dynamic Certificate Authority

**Location**: `ca-service/`

**Features**:
- On-demand certificate generation per session
- Configurable TTL (default: 1 hour)
- Automatic certificate cleanup on expiration
- Certificate Revocation List (CRL)
- Cryptographically signed by root CA

**Endpoints**:
- `POST /generate-cert` - Generate session-based certificate
- `POST /revoke-cert` - Revoke certificate (e.g., on logout)
- `GET /check-cert/:certId` - Verify certificate status
- `GET /crl` - Retrieve Certificate Revocation List
- `GET /certs` - List all active certificates

**Certificate Metadata**:
```json
{
  "certId": "user-session-timestamp",
  "cert": "-----BEGIN CERTIFICATE-----...",
  "key": "-----BEGIN PRIVATE KEY-----...",
  "caCert": "-----BEGIN CERTIFICATE-----...",
  "expiresAt": "2025-12-11T14:30:00Z",
  "metadata": {
    "userId": "operator1",
    "sessionId": "abc123",
    "role": "operator"
  }
}
```

### 3. EDR Proxy Service

**Location**: `edr-proxy/`

**Features**:
- JWT authentication for all requests
- Rate limiting (100 req/min per user)
- Request validation and sanitization
- mTLS connection to Wazuh
- Comprehensive audit logging

**Endpoints**:
- `POST /proxy` - Forward request to EDR with authentication
- `GET /audit` - Retrieve audit log (admin only)

**Request Format**:
```json
{
  "edrId": "wazuh-default",
  "method": "GET",
  "path": "/agents",
  "params": { "limit": 10 },
  "body": null
}
```

**Security Controls**:
1. **Authentication**: Bearer token required
2. **Rate Limiting**: 100 requests/min per user
3. **Validation**: Method, path, EDR ID verified
4. **Audit**: All requests logged with user, timestamp, outcome

### 4. Wazuh Rules Management

**Location**: `backend/index.js` (Wazuh section)

**Features**:
- Upload custom detection rules via API
- XML structure validation
- Integrity verification (SHA-256 hashing)
- Version control tracking
- Auto-deployment to Wazuh instance

**Endpoints**:
- `POST /api/wazuh/rules` - Upload custom rule (admin only)
- `GET /api/wazuh/rules` - List deployed rules
- `POST /api/wazuh/restart` - Restart Wazuh to apply changes (admin only)

**Rule Upload**:
```json
{
  "edrId": "wazuh-default",
  "ruleId": "100001",
  "ruleXml": "<group name=\"custom\">...</group>",
  "description": "Detect credential dumping"
}
```

**Integrity Protection**:
- SHA-256 hash calculated on upload
- Stored in audit log for tamper detection
- Rule changes tracked with user attribution

### 5. Audit Logging

**Location**: All services (backend, edr-proxy, ca-service)

**Events Logged**:
- Authentication attempts (success/failure)
- User creation/deletion
- EDR configuration changes
- Wazuh rule uploads
- Certificate generation/revocation
- All EDR proxy requests
- Session creation/expiration

**Log Format**:
```json
{
  "timestamp": "2025-12-11T12:00:00Z",
  "event": "LOGIN_SUCCESS",
  "user": "operator1",
  "ip": "192.168.1.100",
  "sessionId": "abc123",
  "metadata": {}
}
```

**Access**: `GET /api/audit` (admin role required)

## Threat Mitigation

### 1. Unauthorized C2 Access to Customer EDRs

**Threats**:
- Malicious operator exfiltrating customer data
- Compromised C2 backend accessing EDR without authorization
- Man-in-the-middle attacks on C2-EDR communication

**Mitigations**:
✅ **EDR Proxy**: Centralized authentication gateway
✅ **JWT Authentication**: All EDR requests require valid token
✅ **mTLS**: Encrypted + authenticated transport to Wazuh
✅ **Rate Limiting**: Prevents brute force and DoS
✅ **Audit Logging**: Full request trail for forensics

### 2. Agent Beacon Interception/Tampering

**Threats**:
- Network eavesdropping on agent check-ins
- Impersonation attacks (fake agents)
- Replay attacks (old beacons reused)

**Mitigations**:
✅ **mTLS on Port 4443**: Mutual authentication + encryption
✅ **Certificate Verification**: Only agents with valid certs accepted
✅ **Session-Based Certs**: Short TTL reduces window of compromise
✅ **CRL Checking**: Revoked certs rejected immediately

### 3. EDR Tampering (Rule Integrity)

**Threats**:
- Malicious rule injection to hide attacks
- Rule modification to disable detections
- Unauthorized rule deployment

**Mitigations**:
✅ **Admin-Only Access**: Rule upload requires admin role
✅ **XML Validation**: Malformed rules rejected
✅ **Integrity Hashing**: SHA-256 hash stored for tamper detection
✅ **Audit Trail**: Rule changes tracked with user ID
✅ **Version Control**: Rule history maintained

### 4. Session Hijacking/Replay Attacks

**Threats**:
- Stolen JWT tokens used to impersonate users
- Expired tokens still accepted
- Session fixation attacks

**Mitigations**:
✅ **Token Expiration**: 1-hour TTL (configurable)
✅ **Session Tracking**: Active sessions validated on each request
✅ **Certificate Binding**: JWT + mTLS cert linked to session
✅ **Logout Revocation**: Tokens invalidated on logout
✅ **Refresh Mechanism**: Secure token renewal without re-authentication

### 5. Insider Threat (C2 Operator Abuse)

**Threats**:
- Malicious admin deleting audit logs
- Operator accessing EDR outside working hours
- Privilege escalation attempts

**Mitigations**:
✅ **RBAC**: Operators cannot create users or modify EDRs
✅ **Immutable Audit Log**: Append-only, no deletion
✅ **All Actions Logged**: User ID + timestamp on every operation
✅ **Certificate Revocation**: Immediate access termination
✅ **Session Monitoring**: Active sessions visible to admins

## Deployment Checklist

### Pre-Deployment

- [ ] Change default admin password
- [ ] Generate strong JWT_SECRET (32+ chars)
- [ ] Generate unique INTERNAL_TOKEN for service auth
- [ ] Review and customize certificate TTL
- [ ] Configure rate limits for your environment
- [ ] Set up log aggregation/SIEM integration

### Configuration

**Environment Variables** (`infra/docker-compose.yml`):

```yaml
backend:
  environment:
    - JWT_SECRET=CHANGEME_SECURE_SECRET_KEY_HERE
    - ADMIN_PASSWORD=CHANGEME_STRONG_PASSWORD
    - INTERNAL_TOKEN=CHANGEME_INTERNAL_TOKEN
    - WAZUH_URL=https://host.docker.internal:55000
    - WAZUH_USER=wazuh-wui
    - WAZUH_PASS=wazuh-wui

edr-proxy:
  environment:
    - JWT_SECRET=CHANGEME_SECURE_SECRET_KEY_HERE
    - INTERNAL_TOKEN=CHANGEME_INTERNAL_TOKEN

ca-service:
  environment:
    - CERT_DIR=/certs
```

### Post-Deployment

- [ ] Test login with admin credentials
- [ ] Create operator user accounts
- [ ] Test certificate generation (check CA service logs)
- [ ] Upload test Wazuh rule and verify integrity
- [ ] Review audit logs for anomalies
- [ ] Test agent mTLS connection
- [ ] Verify EDR proxy rate limiting
- [ ] Test logout and certificate revocation

## Security Best Practices

### 1. Password Management

- Use strong passwords (12+ chars, mixed case, numbers, symbols)
- Rotate admin password regularly (every 90 days)
- Never share credentials between users
- Consider integrating with corporate SSO/LDAP

### 2. Certificate Management

- Monitor certificate expiration (CA service auto-cleans)
- Review active certificates regularly
- Revoke certificates immediately on user offboarding
- Keep root CA private key secure (volume backup)

### 3. Audit Log Monitoring

- Export logs to SIEM for long-term retention
- Alert on suspicious patterns:
  - Failed login attempts (>3 in 5 min)
  - Off-hours EDR access
  - Bulk rule uploads
  - Certificate revocation spikes

### 4. Network Segmentation

- Isolate C2 network from production
- Use firewall rules to restrict EDR proxy access
- Consider VPN for operator access
- Disable public exposure of CA service

### 5. Incident Response

**Suspected Compromise**:
1. Review audit logs for unauthorized actions
2. Revoke all active sessions: `GET /api/audit` → `POST /revoke-cert`
3. Rotate JWT_SECRET (forces re-authentication)
4. Review Wazuh rules for tampering (check hashes)
5. Investigate network logs for C2-EDR traffic

**User Termination**:
1. Disable user account (set role to `disabled`)
2. Revoke active sessions
3. Review user's audit trail
4. Rotate EDR credentials if user had admin access

## Testing Security

### 1. Authentication

```bash
# Test login
curl -X POST https://api.gla1v3.local/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'

# Test JWT validation
curl https://api.gla1v3.local/api/agents \
  -H "Authorization: Bearer <token>"

# Test expired token (wait for expiration)
curl https://api.gla1v3.local/api/agents \
  -H "Authorization: Bearer <expired_token>"
```

### 2. RBAC

```bash
# Create operator user (as admin)
curl -X POST https://api.gla1v3.local/api/users \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"username":"operator1","password":"pass123","role":"operator"}'

# Try admin action as operator (should fail)
curl -X POST https://api.gla1v3.local/api/wazuh/rules \
  -H "Authorization: Bearer <operator_token>" \
  -d '...'
```

### 3. Rate Limiting

```bash
# Spam EDR proxy (should block after 100 req/min)
for i in {1..150}; do
  curl -X POST https://edr-proxy.gla1v3.local/proxy \
    -H "Authorization: Bearer <token>" \
    -H "Content-Type: application/json" \
    -d '{"edrId":"wazuh-default","method":"GET","path":"/agents"}'
done
```

### 4. Certificate Lifecycle

```bash
# Check active certificates
curl https://ca.gla1v3.local/certs

# Generate session cert
curl -X POST https://ca.gla1v3.local/generate-cert \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","sessionId":"abc","role":"operator","ttl":300}'

# Verify cert is revoked on logout
curl -X POST https://api.gla1v3.local/api/auth/logout \
  -H "Authorization: Bearer <token>"

curl https://ca.gla1v3.local/check-cert/<certId>
```

## Maintenance

### Daily

- Monitor audit logs for anomalies
- Check active sessions count
- Verify no stale certificates (CA auto-cleans)

### Weekly

- Review user accounts and roles
- Test backup/restore of CA volume
- Audit EDR rule integrity (compare hashes)

### Monthly

- Rotate admin password
- Review and update rate limits
- Security patch backend/proxy/CA containers
- Penetration testing of auth flows

## Support

For security issues or questions:
- Create GitHub issue (for non-sensitive topics)
- Email: security@gla1v3.local
- Review audit logs: `docker exec backend curl http://localhost:3000/api/audit?limit=100`

---

**Document Version**: 1.0  
**Last Updated**: 2025-12-11  
**Security Level**: CONFIDENTIAL
