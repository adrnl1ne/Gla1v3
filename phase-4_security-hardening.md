Gla1v3 Revamp — Phase 4: Security Hardening & Audit Logging
(Week 7–8)

Prerequisite: Phase 3 (Observability) must be complete.

---
Goal

Complete security controls and establish a full audit trail to satisfy ISO 27001
requirements. This phase covers Redis hardening, WAF implementation, audit logging,
database access controls, and the ISO 27001 documentation package.

---
Tasks

1. Redis hardening
   - Enable TLS for all client connections
   - Configure ACL users:
       redis-acl-backend  on  >SECRET  >GET  >SET  >DEL
       redis-acl-c2worker on  >PUBLISH  >SUBSCRIBE
   - Disable dangerous commands: FLUSHALL, FLUSHDB, CONFIG

2. WAF implementation (Coraza)
   - Upgrade Traefik to v3.x (required for Coraza plugin support)
   - Add Coraza WAF plugin configuration in infra/traefik.yml
   - Enable OWASP Core Rule Set on dashboard and API routes
   - Configure a lighter, tuned ruleset for the C2 beacon endpoint
     (shaped to C2 payload structure to minimise false positives)

3. Audit logging
   Log the following events:
   - Admin actions: user creation/deletion, permission changes,
     API key generation, certificate revocation
   - All secret access attempts
   - All failed authentication attempts
   Implementation:
   - Store audit logs in a separate database table
   - Design table for tamper-evidence (append-only, no UPDATE/DELETE grants)

4. Database access controls
   - Review and harden RLS (Row-Level Security) policies for production
   - Add audit trigger on sensitive tables
   - Configure connection pooling with pgBouncer

5. ISO 27001 documentation package
   Create the following files:
   - docs/ISO27001/CONTROLS.md           — mapping of infrastructure to ISO 27001 controls
   - docs/ISO27001/RISK_ASSESSMENT.md    — initial risk assessment template
   - docs/ISO27001/INCIDENT_RESPONSE.md  — incident response procedures
   - docs/ISO27001/ACCESS_CONTROL_POLICY.md — access control policy
   - docs/ISO27001/CHANGE_MANAGEMENT.md  — change management procedures
   - docs/COMPLIANCE_CHECKLIST.md        — ISO 27001 compliance checklist

---
Critical File Paths

  infra/traefik.yml                      (updated — Coraza plugin config)
  infra/dynamic.yml                      (updated — WAF middleware)
  backend/config/rails.rb                (updated — audit logging middleware)
  infra/scripts/init_redis_acl.sh        (new)
  docs/ISO27001/                         (new directory)
  docs/COMPLIANCE_CHECKLIST.md           (new)

---
Verification

1. Test Coraza WAF by sending a SQL injection payload to an API endpoint:
     curl -X POST https://api.gla1v3.local/endpoint \
       -d "username=admin' OR '1'='1"
     (expect 403 or similar block response)

2. Verify audit logs are written on admin actions:
     SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 10;

3. Verify Redis ACL by attempting a restricted command from a restricted user:
     redis-cli -u redis://backend-user:SECRET@localhost:6379 FLUSHALL
     (expect NOPERM error)

---
ISO 27001 Controls Addressed

  A.9  — Access Control
  A.12 — Operations Security
  A.16 — Security Incidents
