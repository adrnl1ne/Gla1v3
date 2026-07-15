Gla1v3 Revamp — Phase 2: Secrets Management
(Week 3–4)

Prerequisite: Phase 1 (Foundation Hardening) must be complete.

---
Goal

Remove all plaintext secrets from .env files and replace them with HashiCorp Vault.
Migrate the CA service from disk-based key storage to the Vault PKI engine.

---
Tasks

1. HashiCorp Vault setup
   - Deploy Vault in dev mode initially (local development)
   - Enable KV secrets engine at path: gla1v3/
   - Enable PKI secrets engine for dynamic certificate issuance
   - Configure secret TTLs and auto-renewal policies

2. Vault container (add to infra/docker-compose.yml)

     vault:
       image: hashicorp/vault:1.15
       command: vault server -dev -dev-root-token-id=dev-root
       environment:
         VAULT_DEV_LISTEN_ADDRESS: 0.0.0.0:8200
       volumes:
         - vault-storage:/vault/file
       networks:
         - app-net
       healthcheck:
         test: ["CMD", "vault", "status"]
         interval: 10s
         timeout: 5s
         retries: 5
       restart: unless-stopped

3. Secret migration — move all secrets from .env into Vault KV:

     vault kv put gla1v3/config DB_PASSWORD=<value>
     vault kv put gla1v3/config JWT_SECRET=<value>
     vault kv put gla1v3/config ADMIN_PASSWORD=<value>
     vault kv put gla1v3/config REDIS_PASSWORD=<value>
     vault kv put gla1v3/config INTERNAL_TOKEN=<value>
     vault kv put gla1v3/config AGENT_WHOAMI_TOKEN=<value>

4. Backend Vault Agent sidecar
   - Add Vault Agent container alongside the backend
   - Configure templated config output to: /tmp/secrets/.env
   - Backend reads secrets from the mounted file instead of environment variables

5. CA service PKI migration
   - Replace disk-based CA keys with Vault PKI engine
   - CA service calls Vault API for:
       Issue certificate:  GET /v1/pki/issue/cert-subdomain
       Revoke certificate: POST /v1/pki/revoke
   - Remove /certs/ volume from CA service
   - Keep only the CA certificate (public key) on disk for trust anchoring

6. Vault health monitoring
   - Monitor endpoint: /v1/sys/health
   - Add Alertmanager alert for Vault unreachable

---
Critical File Paths

  infra/vault-config/init.hcl        (new)
  infra/vault-config/policy.hcl      (new)
  infra/docker-compose.yml           (updated — add Vault container)
  backend/Dockerfile                 (updated — add Vault Agent)
  backend/config/vault.js            (new — Vault client library)

---
Verification

1. Verify Vault is running:
     curl http://localhost:8200/v1/sys/health

2. Verify secrets are stored in Vault:
     vault kv get gla1v3/config

3. Verify backend reads from Vault:
     docker logs <backend-container> | grep -i vault

4. Verify CA service no longer writes private keys to disk:
     docker exec <ca-container> ls /certs/   (should be empty or absent)

---
ISO 27001 Controls Addressed

  A.8  — Asset Management
  A.10 — Cryptography
  A.11 — Access Control
