Gla1v3 Revamp — Phase 1: Foundation Hardening
(Week 1–2)

Prerequisite: Phase 0 (Wazuh Cleanup) must be complete.

---
Goal

Remove critical security vulnerabilities and establish baseline hardening across
the Docker infrastructure, network layout, secrets, TLS configuration, and Dockerfiles.

---
Tasks

1. Network segmentation (3 Docker networks)
   - dmz-net:  Traefik only (external-facing)
   - app-net:  Backend + Frontend + CA Service (internal API access)
   - data-net: Postgres + Redis (database access only — no host port publish)

2. Secrets sanitization
   - Generate strong random values for all secrets:
       JWT_SECRET          →  openssl rand -base64 64
       DB_PASSWORD         →  openssl rand -hex 32
       ADMIN_PASSWORD      →  openssl rand -hex 32
       REDIS_PASSWORD      →  openssl rand -hex 32
       INTERNAL_TOKEN      →  openssl rand -hex 32
       AGENT_WHOAMI_TOKEN  →  openssl rand -hex 32
   - Create .env.template (no secrets) for the public repository
   - Create .env.local (with secrets) and add it to .gitignore

3. TLS hardening
   - infra/dynamic.yml: set TLS minimum version to VersionTLS13
   - Add HSTS middleware: max-age=31536000; includeSubDomains; preload
   - Add security headers: X-Frame-Options, X-Content-Type-Options, CSP

4. Postgres hardening
   - Remove host port publish (remove the 5432:5432 mapping)
   - Set ssl_mode=require for all client connections
   - Mount CA certificate for TLS verification

5. Dockerfile hardening
   - Backend: run as non-root user (USER 65534 or node:alpine with USER app)
   - Add read-only rootfs for stateless containers where possible

---
Critical File Paths

  infra/docker-compose.yml
  infra/dynamic.yml
  infra/docker-compose.db.yml
  backend/Dockerfile
  infra/scripts/database/start-db.sh
  .env.template                (new)
  .env.local                   (new — gitignored)

---
Verification

1. Start infrastructure:
     docker-compose up -d

2. Verify all containers are healthy:
     docker-compose ps

3. Confirm Postgres is NOT reachable from host — port 5432 should not respond.

4. Confirm API and Dashboard are accessible via HTTPS.

5. Verify TLS 1.3 handshake:
     openssl s_client -connect localhost:443 -tls1_3

6. Verify HSTS header is present:
     curl -I https://dashboard.gla1v3.local
     (look for Strict-Transport-Security in response headers)

---
ISO 27001 Controls Addressed

  A.9  — Access Control
  A.10 — Cryptography
  A.12 — Operations Security
