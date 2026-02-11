# Backend Database Integration Complete

## ✅ What Was Changed

### Database Infrastructure
- ✅ PostgreSQL 16 database with separate lifecycle
- ✅ Connection pooling with `pg` (node-postgres)
- ✅ Automated daily backups (3 AM, keeps 7 days)
- ✅ Row-Level Security (RLS) for tenant isolation
- ✅ Database management scripts (start, stop, backup, reset)

### Models Migrated to PostgreSQL
1. **User.js** - Operators and admins with tenant assignments
2. **Agent.js** - Agents with geolocation and certificate tracking
3. **Task.js** - Tasks with embedded and command support
4. **Tenant.js** - NEW - Client companies with API keys
5. **Result.js** - NEW - Task execution results (1:N with tasks)

### Services Updated
- **authService.js** - Returns user's tenants on login
- **agentService.js** - Handles tenant context for agent registration
- **taskService.js** - Creates tasks with tenant association

### Middleware Enhanced
- **auth.js** - Sets RLS context on authentication
- Added `requireTenantAccess` middleware for tenant validation

### Routes Updated
- **agents.js** - Async handlers with tenant support  
- **tasks.js** - Async handlers with tenant context
- **auth.js** - Already async-ready

## 📊 Database Schema

### Tables
```
tenants
├── id (UUID, PK)
├── name (TEXT, UNIQUE)
├── api_key (TEXT, UNIQUE)
├── description
└── active (BOOLEAN)

users
├── id (UUID, PK)
├── username (TEXT, UNIQUE)
├── password_hash (TEXT)
├── role (admin | operator)
└── active (BOOLEAN)

user_tenants (many-to-many)
├── user_id (UUID, FK → users)
├── tenant_id (UUID, FK → tenants)
└── assigned_at (TIMESTAMP)

agents
├── id (UUID, PK)
├── tenant_id (UUID, FK → tenants)
├── hostname, cn, os, arch, username
├── ip_address, geolocation fields
├── cert_fingerprint, cert_expiry, cert_status
└── status, first_seen, last_seen

tasks
├── id (UUID, PK)
├── tenant_id (UUID, FK → tenants)
├── agent_id (UUID, FK → agents)
├── command, args, embedded_type, embedded_params
├── status, created_by
└── timestamps

results
├── id (UUID, PK)
├── tenant_id (UUID, FK → tenants)
├── task_id (UUID, FK → tasks)
├── stdout, stderr, exit_code
├── stream_index, result_type
└── timestamp
```

## 🔐 Row-Level Security

**Admins**: See all data across all tenants
**Operators**: Only see data from their assigned tenants

RLS is automatically enforced via PostgreSQL policies. When a user authenticates:
1. JWT token includes `userId`
2. Auth middleware calls `setCurrentUser(userId)`
3. PostgreSQL RLS filters all queries based on user's tenant assignments

## 🚀 How to Use

### Start Database
```powershell
# Windows
cd infra\db
.\start-db.ps1

# Linux/Mac
cd infra/db
./start-db.sh
```

### Start Full Infrastructure
```powershell
# Database auto-starts if not running
cd infra
.\start.ps1
```

### Database Connection
Backend automatically connects using environment variables:
- `DB_HOST=postgres`
- `DB_PORT=5432`
- `DB_NAME=gla1v3`
- `DB_USER=gla1v3_app`
- `DB_PASSWORD=<from .env>`

## 📝 API Changes

### Login Response Now Includes Tenants
```json
{
  "token": "...",
  "user": { "userId": "...", "username": "admin", "role": "admin" },
  "tenants": [
    { "id": "...", "name": "Default", "description": "..." },
    { "id": "...", "name": "Client A", "description": "..." }
  ]
}
```

### Agent Registration (Beacon)
- Agents automatically assigned to default tenant
- Future: Support tenant-specific agent builds with embedded tenant ID

### Task Creation
```javascript
POST /api/tasks
{
  "agentId": "agent-uuid",
  "cmd": "whoami",
  "tenantId": "optional-tenant-uuid" // Uses agent's tenant if omitted
}
```

## 🔧 Backward Compatibility

### Default Tenant
- A "Default" tenant is created automatically on first DB startup
- Admin user is assigned to Default tenant
- All agents without explicit tenant go to Default tenant
- This ensures existing workflows continue to work

### In-Memory → Database
All in-memory `Map` storage has been replaced with PostgreSQL:
- ✅ Data persists across restarts
- ✅ Multi-tenant isolation
- ✅ Audit trails
- ✅ Efficient queries with indexes

## 🛠 Maintenance

### Backups
```powershell
# Automated: Daily at 3 AM
# Manual
cd infra\db
.\backup-db.ps1
```

### Reset Database
```powershell
cd infra\db
.\reset-db.ps1  # Type "DELETE EVERYTHING" to confirm
```

### Check Database Health
```powershell
docker exec gla1v3-postgres pg_isready -U gla1v3_app -d gla1v3
```

### Connect to Database
```powershell
docker exec -it gla1v3-postgres psql -U gla1v3_app -d gla1v3
```

## 📈 Next Steps (Future)

1. **Frontend Integration**
   - Add tenant selector UI component
   - Filter agents/tasks by selected tenant
   - Admin tenant management UI

2. **Tenant Management API**
   - POST `/api/tenants` - Create tenant
   - GET `/api/tenants/:id/users` - List tenant users
   - POST `/api/tenants/:id/users/:userId` - Assign user to tenant
   - DELETE `/api/tenants/:id/users/:userId` - Remove user from tenant

3. **Agent Build with Tenant**
   - Embed tenant API key in agent build
   - Agent registers to specific tenant automatically

4. **Redis Integration**
   - Certificate revocation list (CRL)
   - Session management
   - Real-time agent status

5. **Advanced Security**
   - Tenant-specific admin roles
   - Granular permissions
   - API rate limiting per tenant
   - Audit log queries

## ⚠️ Important Notes

- **Database password** is in `infra/db/.env` - DO NOT commit to git
- **RLS context** is set automatically by auth middleware
- **Admin role** bypasses RLS and sees all tenants
- **Operators** only see tenants they're assigned to
- **Default tenant** exists for backward compatibility

## 🐛 Troubleshooting

### "Failed to connect to database"
```powershell
# Start database first
cd infra\db
.\start-db.ps1
```

### "Authentication failed"
Database password might be out of sync between:
- `infra/db/.env`
- `infra/.env`

Make sure `DB_PASSWORD` matches in both files.

### "No tenant available"
Default tenant should be created automatically. If missing:
```sql
docker exec -it gla1v3-postgres psql -U gla1v3_app -d gla1v3
INSERT INTO tenants (id, name, api_key, description, active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'default-tenant-key', 'Default tenant', true);
```

---

**Database integration is complete and ready for testing!** 🎉
