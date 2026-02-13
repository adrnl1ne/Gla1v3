# Security Limitations & Token/Certificate Management

## Current Architecture Overview

### Agent Build Process
Agents are compiled with **embedded credentials** at build time:
```bash
go build -ldflags "
  -X 'pkg/config.TenantAPIKey=xxx'
  -X 'pkg/config.EmbeddedCACert=...'
  -X 'pkg/config.EmbeddedCert=...'
  -X 'pkg/config.EmbeddedKey=...'
"
```

This means each built agent has **static, hardcoded credentials** that cannot be changed without recompiling.

Note: the backend no longer accepts `X-Tenant-API-Key` as an authentication fallback for agent endpoints — mTLS is required for agent authentication.

---

## Token & Certificate Rotation

### ❌ Current Limitations

#### 1. **NO Dynamic Token Rotation**
- **Tenant API Keys** are embedded at build time
- Once an agent is compiled, its API key is **permanent**
- No mechanism to rotate keys for deployed agents
- Compromised API key requires:
  - Generating new API key in database
  - Rebuilding ALL agents for that tenant
  - Redeploying agents to all hosts

#### 2. **NO Dynamic Certificate Rotation**
- **mTLS certificates** are embedded at build time
- Certificates are static for the lifetime of the agent binary
- No mechanism to:
  - Rotate certs for running agents
  - Push updated certs to deployed agents
  - Implement short-lived certificates (e.g., 24-hour renewal)

#### 3. **Certificate Revocation (Phase‑1: automated on blacklist) — UPDATED**
- When an agent is blacklisted via Redis:
  - ✅ Agent ID is blocked (403 Forbidden on beacon)
  - ✅ **CA‑issued certs** (tracked via `cert_id`) are revoked automatically when the agent is blacklisted (backend calls CA `/revoke-cert`).
  - ✅ **Embedded cert fingerprints** can now be recorded at beacon and treated as revocation targets (feature flag `ENABLE_EMBEDDED_CERT_REVOCATION`). Blacklisted fingerprints are rejected at the application layer.
  - ⚠️ Certificate may still be accepted at the TLS layer unless Traefik is configured to consult a CRL (infra work remaining)
- **Security note**: Phase‑1 (automatic revocation on blacklist) is complete — CA-issued certs are revoked and embedded-cert fingerprints are tracked & rejected at the application layer. Remaining work: TLS‑layer CRL enforcement and broader infra integration.
- **Mitigation**: Traefik mTLS + backend blacklist/fingerprint checks provide strong defense-in-depth while CRL enforcement is planned.

---

## Agent Blacklisting - How It Works

### Current Implementation

When you blacklist an agent via the dashboard:

1. **Redis Blacklist Entry Created**:
   ```javascript
   // backend/services/tokenBlacklistService.js
   key: "tenant:1:blacklist:agent:abc123"
   value: {
     agentId: "abc123",
     tenantId: 1,
     reason: "Compromised",
     blacklistedAt: "2026-02-10T16:00:00Z",
     expiresAt: "2026-02-17T16:00:00Z"
   }
   ttl: 604800  // 7 days
   ```

2. **Beacon Endpoint Checks Blacklist**:
   ```javascript
   // backend/routes/agents.js - Line 85-95
   const isBlacklisted = await tokenBlacklistService.isAgentBlacklisted(agentId, tenantId);
   if (isBlacklisted) {
     return res.status(403).json({ 
       error: 'Agent access revoked',
       reason: blacklistInfo?.reason
     });
   }
   ```

3. **Agent Receives 403 Forbidden**:
   ```
   🚫 [BEACON] BLOCKED - Agent abc123 is blacklisted: Compromised
   ```

Note: Agents now defer execution of build-time embedded "startup" tasks until after the agent's first successful beacon. This prevents unauthenticated or pre-registration embedded-results from being sent to the server before the agent is validated.
- CA service `/revoke-cert` **is now invoked automatically for tracked CA-issued certs** when an agent is blacklisted (Phase‑1 completed)
- Embedded cert fingerprints can be recorded and rejected by the backend when `ENABLE_EMBEDDED_CERT_REVOCATION` is enabled
- TLS-layer CRL/OCSP enforcement in Traefik is still pending (infra work)

❌ **Token Rotation**:
- Tenant API key is not rotated
- Other agents with same tenant key remain operational

❌ **Notification to Agent**:
- Agent doesn't know it's blacklisted until next beacon attempt
- No push mechanism to force immediate shutdown

---

## Security Posture

### ✅ Effective Protections

1. **Immediate Beacon Blocking**:
   - Agent cannot check in or receive tasks
   - Blacklist is enforced server-side (can't be bypassed)

2. **Multi-Tenant Isolation**:
   - Blacklisting is per-tenant (agent ID + tenant ID)
   - Prevents cross-tenant access even if agent ID duplicates

3. **Automatic Expiration**:
   - Blacklist entries auto-expire (default 7 days)
   - Prevents indefinite resource consumption

4. **Cache Invalidation**:
   - Agent cache is cleared on blacklist
   - Ensures immediate effect (no stale cache serving)

### ⚠️ Known Gaps

1. **Certificate Remains Valid**:
   - **Impact**: Blacklisted agent cert could be extracted and used for other purposes
   - **Mitigation**: mTLS is only used for C2 beacon endpoint which checks blacklist
   - **Risk Level**: Low (cert alone doesn't bypass blacklist check)

2. **No Real-Time Revocation**:
   - **Impact**: Agent continues running until next beacon (could be 30-60 seconds)
   - **Mitigation**: Set low beacon intervals for critical environments
   - **Risk Level**: Low (attacker has minimal window)

3. **Tenant API Key Not Rotated**:
   - **Impact**: If key is compromised, rebuilding one agent doesn't help
   - **Mitigation**: Must rotate tenant key + rebuild ALL tenant agents
   - **Risk Level**: Medium (requires manual intervention)

---

## CA Service Certificate Management

### Available Endpoints

The CA service (`ca-service/index.js`) provides:

```javascript
// Revoke certificate (manual)
POST /revoke-cert
Body: { certId: "agent-123-session-456", reason: "Compromised" }

// Check if cert is revoked
GET /check-cert/:certId

// Get Certificate Revocation List
GET /crl

// List active certificates
GET /certs
```

### Certificate revocation integration — current status

- ✅ **Phase‑1 (completed)** — Automatic revocation on blacklist:
  - CA‑issued (tracked) certificates: backend now calls the CA `/revoke-cert` for `cert_id` when an agent is blacklisted.
  - Embedded certificates: when `ENABLE_EMBEDDED_CERT_REVOCATION` is enabled the agent's embedded cert fingerprint (SHA‑256) is stored and blacklist operations add that fingerprint to Redis; the backend rejects beacons/embedded-results matching revoked fingerprints.
  - Database/Redis upsert for blacklist entries was hardened (ON CONFLICT on agent_id+tenant_id) so blacklist writes are reliable.

- ⚠️ **Remaining gap**: TLS‑layer CRL enforcement (Traefik) is not yet implemented — revocation is enforced at the application layer for now.

**Short revocation flow (Phase‑1)**
1. Operator blacklists agent via dashboard → backend upserts blacklist row + (if available) stores cert fingerprint and triggers CA revoke for `cert_id`.
2. Backend writes blacklist entry into Redis (fast enforcement).
3. Traefik mTLS still validates TLS handshakes, but beacon/embedded endpoints check Redis + fingerprint and return 403/403 accordingly.
4. Agent is blocked immediately at the application layer; CA record is revoked for tracked certs.

**Note:** Full crypto‑layer enforcement (CRL/OCSP) is planned as Phase‑2.

### Certificate Types

1. **Agent Certificates** (embedded):
   - Generated during agent build
   - Embedded in binary via `-ldflags`
   - No rotation mechanism
   - No tracking of cert-to-agent mapping

2. **Session Certificates** (CA service):
   - For dashboard/API users (future use)
   - Dynamically issued with TTL
   - Tracked by `certId`
   - Can be revoked via `/revoke-cert`

---

## Recommended Enhancements (Future)

### Short-Term (High Priority)

1. **Implement Cert Revocation Trigger**:
   ```javascript
   // backend/services/tokenBlacklistService.js
   async blacklistAgentToken(agentId, tenantId, reason) {
     // ... existing blacklist logic ...
     
     // NEW: Revoke certificate if we have certId
     if (agent.certId) {
       await fetch('http://ca-service:3003/revoke-cert', {
         method: 'POST',
         body: JSON.stringify({ certId: agent.certId, reason })
       });
     }
   }
   ```

2. **Add CRL Enforcement in Traefik**:
   - Configure Traefik to check CRL before accepting mTLS
   - Requires CRL distribution mechanism

### Medium-Term (Recommended)

3. **Dynamic Certificate Issuance**:
   - Agents request cert on first boot (not embedded)
   - Short-lived certs (24 hours)
   - Auto-renewal via beacon endpoint

4. **Token Rotation API**:
   - Endpoint to rotate tenant API keys
   - Agents periodically fetch new key
   - Old key deprecated with grace period

### Long-Term (Advanced)

5. **Push Revocation**:
   - WebSocket/long-polling for immediate blacklist notification
   - Agent immediately terminates on revocation

6. **Attestation & Remote Verification**:
   - Agent integrity checks before cert issuance
   - Platform-specific attestation (TPM, Secure Enclave)

---

## Best Practices (Current System)

### For Operators

1. **Treat Blacklisting as Immediate Isolation**:
   - Agent cannot beacon or receive tasks
   - Plan for manual cleanup if agent persists

2. **Rotate Tenant API Keys if Compromised**:
   ```sql
   -- Update tenant API key
   UPDATE tenants 
   SET api_key = 'new_secure_key_here'
   WHERE id = 1;
   ```
   - Rebuild ALL agents for that tenant
   - Deploy to all hosts

3. **Regular Agent Rebuilds**:
   - Periodically rebuild agents with fresh certs
   - Implement cert expiration policy (e.g., rebuild every 90 days)

4. **Monitor Blacklist**:
   ```bash
   # Check Redis for blacklisted agents
   docker exec redis redis-cli KEYS "tenant:*:blacklist:agent:*"
   ```

### For Thesis Documentation

When documenting your Redis implementation:

**Strengths to Highlight**:
- Server-side token blacklisting with auto-expiration
- Multi-tenant isolated blacklist namespace
- Integration with task queue and caching layers
- Fail-open resilience (Redis errors don't block all agents)

**Limitations to Acknowledge**:
- Static credentials (embedded at build time)
- No dynamic token/cert rotation
- Certificate revocation: **partially automated (Phase‑1)** — CA revoke + embedded-cert fingerprint tracking implemented; TLS‑layer CRL enforcement still pending
- Recommendation for future dynamic credential management

---

## Comparison: Static vs. Dynamic Credentials

### Current (Static Embedded)

**Pros**:
- ✅ Simple deployment (single binary)
- ✅ No external dependencies on runtime
- ✅ Works offline/air-gapped
- ✅ Fast startup (no handshake)

**Cons**:
- ❌ No rotation without rebuild
- ❌ Compromised creds = recompile everything
- ❌ Long-lived credentials = larger attack surface

### Future (Dynamic Issuance)

**Pros**:
- ✅ Short-lived credentials
- ✅ Rotation without recompilation
- ✅ Per-agent cert tracking
- ✅ Immediate revocation

**Cons**:
- ❌ Requires CA service availability
- ❌ Bootstrap credential problem
- ❌ More complex deployment
- ❌ Network dependency on startup

---

## Security Posture Summary

### Current Implementation Rating

| Security Control | Status | Effectiveness |
|-----------------|--------|---------------|
| Beacon Blacklisting | ✅ Implemented | **High** |
| Multi-Tenant Isolation | ✅ Implemented | **High** |
| Cache Invalidation | ✅ Implemented | **High** |
| Auto-Expiration | ✅ Implemented | **Medium** |
| Certificate Revocation | ✅ Partially (Phase‑1) | **Medium** (app‑layer enforcement) |
| Token Rotation | ❌ Not Implemented | N/A |
| Dynamic Credentials | ❌ Not Implemented | N/A |

### Overall Assessment

**For a Red Team C2 Framework (Thesis Project)**:
- ✅ **Adequate** for demonstration and testing
- ✅ **Effective** server-side access control
- ⚠️ **Limitations documented** for academic honesty
- ❌ **Not production-ready** without cert revocation

**For Production/Real-World Deployment**:
- Would require dynamic credential management
- Certificate revocation integration mandatory
- Token rotation mechanism essential
- But for thesis purposes, current design is **well-architected** with clear upgrade path

---

## References

### Related Files

- [backend/services/tokenBlacklistService.js](../backend/services/tokenBlacklistService.js) - Blacklist implementation
- [backend/routes/agents.js](../backend/routes/agents.js#L85-L95) - Beacon blacklist check
- [ca-service/index.js](../ca-service/index.js) - Certificate authority endpoints
- [agents-go/pkg/config/config.go](../agents-go/pkg/config/config.go#L12-L16) - Embedded credentials
- [backend/routes/build.js](../backend/routes/build.js#L32-L37) - Agent compilation
- [docs/REDIS_INTEGRATION.md](./REDIS_INTEGRATION.md) - Token blacklisting architecture

### Industry Standards

- **NIST SP 800-204C**: DevSecOps for Microservices
- **OAuth 2.0 Token Revocation (RFC 7009)**: Token  blacklist patterns
- **X.509 CRL (RFC 5280)**: Certificate Revocation Lists
- **MITRE ATT&CK T1078**: Valid Accounts (mitigation via blacklisting)

---

**Last Updated**: 2026-02-13  
**Project**: Gla1v3 Multi-Tenant C2 Framework  
**Author**: Security Architecture Documentation
