# GLA1V3 Infrastructure Startup

## Quick Start

```powershell
cd infra
.\start.ps1     # Windows
# or
./start.sh      # Linux
```

## What It Does

1. **Validates** `.env` configuration
2. **Syncs** database password between `./.env` (repo root) and `infra/db/.env`
3. **Starts** PostgreSQL if not running
4. **Generates** mTLS certificates
5. **Launches** all services via Docker Compose

## First Startup (Empty Database)

PostgreSQL runs initialization scripts from `infra/db/init/`:
1. `01-schema.sql` - Creates tables (tenants, users, agents, tasks, results, audit_log)
2. `02-rls-policies.sql` - Enables Row-Level Security for multi-tenant isolation
3. `03-functions.sql` - Helper functions
4. `04-create-api-user.sh` - Creates `gla1v3_api` user (non-privileged, RLS enforced)

## Database Users

| User | Privileges | Purpose |
|------|-----------|---------|
| `gla1v3_app` | SUPERUSER | Admin operations, manual queries |
| `gla1v3_api` | Normal (RLS enforced) | Backend runtime (used by application) |

## Architecture

### PostgreSQL
- **Version:** 16-alpine
- **Purpose:** Multi-tenant data isolation with Row-Level Security
- **Docs:** https://www.postgresql.org/docs/16/

### Redis
- **Version:** 7-alpine
- **Purpose:** Session storage (JWT session IDs with 24h TTL)
- **Docs:** https://redis.io/docs/

### Traefik
- **Version:** 3.0
- **Purpose:** Reverse proxy with automatic HTTPS and mTLS for C2
- **Docs:** https://doc.traefik.io/traefik/

### OpenSearch (Wazuh Stack)
- **Purpose:** EDR alert storage and querying (optional)
- **Docs:** https://wazuh.com/platform/

Note: Wazuh start is optional — the `start` script will attempt to start the `infra/wazuh` stack only if that folder exists. The core platform does not require Wazuh.

## Verification

```powershell
# Check all services running
docker ps

# Test RLS (should only see assigned tenant data)
docker exec gla1v3-postgres psql -U gla1v3_api -d gla1v3 -c "
  SET app.current_user_id = 'user-uuid';
  SELECT COUNT(*) FROM agents;
"

# Check backend connection
docker logs backend --tail 20
```

Expected: `✅ Database connected successfully`
