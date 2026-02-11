# Tenant Management API Documentation

## Authentication
All endpoints require JWT authentication with **admin role**.

Add header: `Authorization: Bearer <jwt_token>`

---

## Tenants API

### List All Tenants
```http
GET /api/tenants
GET /api/tenants?activeOnly=true
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Client A",
    "api_key": "tenant_abc123...",
    "description": "Description",
    "active": true,
    "created_at": "2026-02-09T...",
    "updated_at": "2026-02-09T..."
  }
]
```

### Get Tenant by ID
```http
GET /api/tenants/:id
```

**Response:** Single tenant object

### Create Tenant
```http
POST /api/tenants
Content-Type: application/json

{
  "name": "Client B",
  "description": "Optional description",
  "apiKey": "optional-custom-key"  // Auto-generated if omitted
}
```

**Response:** Created tenant object (201)

**Errors:**
- `400` - Name is required
- `409` - Tenant with name already exists

### Update Tenant
```http
PUT /api/tenants/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description",
  "active": false,
  "apiKey": "new-key"
}
```

**Response:** Updated tenant object

**Note:** All fields are optional

### Delete Tenant
```http
DELETE /api/tenants/:id
```

**Response:**
```json
{
  "message": "Tenant deleted successfully"
}
```

**Errors:**
- `403` - Cannot delete default tenant
- `404` - Tenant not found

**Warning:** Cascade deletes all agents, tasks, and results!

---

## Tenant Users Management

### Get Users Assigned to Tenant
```http
GET /api/tenants/:id/users
```

**Response:**
```json
[
  {
    "id": "uuid",
    "username": "operator1",
    "role": "operator",
    "active": true,
    "assigned_at": "2026-02-09T..."
  }
]
```

### Assign User to Tenant
```http
POST /api/tenants/:tenantId/users/:userId
```

**Response:**
```json
{
  "message": "User assigned successfully",
  "tenant": { "id": "uuid", "name": "Client A" },
  "user": { "id": "uuid", "username": "operator1" }
}
```

**Errors:**
- `404` - Tenant or user not found

### Remove User from Tenant
```http
DELETE /api/tenants/:tenantId/users/:userId
```

**Response:**
```json
{
  "message": "User removed from tenant successfully"
}
```

---

## Tenant Statistics

### Get Tenant Stats
```http
GET /api/tenants/:id/stats
```

**Response:**
```json
{
  "total_agents": 15,
  "active_agents": 12,
  "inactive_agents": 3,
  "total_tasks": 342,
  "pending_tasks": 5,
  "completed_tasks": 320,
  "failed_tasks": 17
}
```

---

## Users API

### List All Users
```http
GET /api/users
```

**Response:**
```json
[
  {
    "id": "uuid",
    "username": "admin",
    "role": "admin",
    "active": true,
    "created_at": "2026-02-09T...",
    "updated_at": "2026-02-09T..."
  }
]
```

**Note:** Password hashes are never returned

### Get User by ID
```http
GET /api/users/:id
```

**Response:** Single user object (without password_hash)

### Get User's Tenants
```http
GET /api/users/:id/tenants
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Client A",
    "description": "...",
    "active": true,
    "assigned_at": "2026-02-09T..."
  }
]
```

### Create User
```http
POST /api/users
Content-Type: application/json

{
  "username": "operator2",
  "password": "SecurePassword123!",
  "role": "operator",  // "admin" or "operator", default: "operator"
  "tenantIds": ["uuid1", "uuid2"]  // Optional, assign to tenants
}
```

**Response:** Created user object (201)

**Errors:**
- `400` - Username/password required, password < 8 chars
- `409` - Username already exists

**Validation:**
- Username: required
- Password: minimum 8 characters
- Role: `admin` or `operator`

### Update User
```http
PUT /api/users/:id
Content-Type: application/json

{
  "username": "newusername",
  "password": "NewPassword123!",
  "role": "operator",
  "active": false
}
```

**Response:** Updated user object

**Errors:**
- `400` - Password < 8 chars
- `403` - Cannot remove your own admin role
- `404` - User not found

**Note:** All fields are optional

### Delete User
```http
DELETE /api/users/:id
```

**Response:**
```json
{
  "message": "User deleted successfully"
}
```

**Errors:**
- `403` - Cannot delete yourself or default admin
- `404` - User not found

### Bulk Assign User to Tenants
```http
POST /api/users/:id/tenants
Content-Type: application/json

{
  "tenantIds": ["uuid1", "uuid2", "uuid3"]
}
```

**Response:**
```json
{
  "message": "User assigned to tenants successfully",
  "assignedTenants": 3
}
```

---

## Common Error Responses

### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "error": "admin role required"
}
```

### 404 Not Found
```json
{
  "error": "Tenant not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to create tenant"
}
```

---

## Example Workflows

### Create New Client Engagement

```bash
# 1. Create tenant for new client
curl -X POST https://api.gla1v3.local/api/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "description": "Pentesting engagement Q1 2026"
  }'

# Response: { "id": "tenant-uuid", ... }

# 2. Create operator for this engagement
curl -X POST https://api.gla1v3.local/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "operator.acme",
    "password": "SecurePass123!",
    "role": "operator",
    "tenantIds": ["tenant-uuid"]
  }'

# 3. Build tenant-specific agent (future feature)
# Agent will use tenant API key to register automatically
```

### Assign Existing User to Multiple Clients

```bash
# Get user ID
curl https://api.gla1v3.local/api/users \
  -H "Authorization: Bearer $TOKEN"

# Bulk assign to tenants
curl -X POST https://api.gla1v3.local/api/users/user-uuid/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantIds": ["tenant1-uuid", "tenant2-uuid"]
  }'
```

### View Client Statistics

```bash
# Get tenant stats
curl https://api.gla1v3.local/api/tenants/tenant-uuid/stats \
  -H "Authorization: Bearer $TOKEN"

# Response shows agent counts, task counts, etc.
```

---

## Security Considerations

### Password Requirements
- Minimum 8 characters
- Recommended: Mix of upper/lower case, numbers, symbols

### API Key Management
- Auto-generated securely if not provided
- Used for agent-to-tenant association (future)
- Can be regenerated by updating tenant

### Role Permissions
- **Admin**: Full access to all tenants and users
- **Operator**: Access only to assigned tenants

### Audit Logging
All tenant/user operations are logged via audit middleware:
- `tenant_created`, `tenant_updated`, `tenant_deleted`
- `user_created`, `user_updated`, `user_deleted`
- `user_assigned_to_tenant`, `user_removed_from_tenant`

### Protected Operations
- Cannot delete default tenant
- Cannot delete default admin user
- Cannot delete your own account
- Cannot remove your own admin role
