-- Gla1v3 PostgreSQL Schema with Multi-Tenant Support
-- This schema supports tenant isolation for multi-client operations

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TENANTS (Client Companies)
-- ============================================================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    api_key TEXT UNIQUE,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_active ON tenants(active);
CREATE INDEX idx_tenants_api_key ON tenants(api_key) WHERE api_key IS NOT NULL;

-- ============================================================================
-- USERS (Operators and Admins)
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
    active BOOLEAN DEFAULT true,
    totp_secret TEXT,
    totp_enabled BOOLEAN DEFAULT false,
    totp_backup_codes TEXT[],
    totp_enabled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_totp_enabled ON users(totp_enabled);

COMMENT ON COLUMN users.totp_secret IS 'Encrypted TOTP secret for 2FA';
COMMENT ON COLUMN users.totp_enabled IS 'Whether 2FA is enabled for this user';
COMMENT ON COLUMN users.totp_backup_codes IS 'Array of bcrypt-hashed backup codes for account recovery';
COMMENT ON COLUMN users.totp_enabled_at IS 'Timestamp when 2FA was enabled';

-- ============================================================================
-- USER_TENANTS (Many-to-Many: Users can access multiple tenants)
-- ============================================================================
CREATE TABLE user_tenants (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant ON user_tenants(tenant_id);

-- ============================================================================
-- AGENTS (Compromised hosts, isolated per tenant)
-- ============================================================================
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Identity
    hostname TEXT NOT NULL,
    cn TEXT,
    
    -- System Info
    os TEXT,
    arch TEXT,
    username TEXT, -- User context agent runs as
    
    -- Network
    ip_address INET,
    
    -- Geolocation (from geoip lookup)
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    geo_country TEXT,
    geo_region TEXT,
    geo_city TEXT,
    
    -- Certificate Management
    cert_fingerprint TEXT,
    cert_issued_at TIMESTAMPTZ,
    cert_expiry TIMESTAMPTZ,
    cert_status TEXT DEFAULT 'active' CHECK (cert_status IN ('active', 'revoked', 'expired', 'pending')),
    
    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'compromised', 'removed')),
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_agents_tenant ON agents(tenant_id);
CREATE INDEX idx_agents_status ON agents(tenant_id, status);
CREATE INDEX idx_agents_hostname ON agents(tenant_id, hostname);
CREATE INDEX idx_agents_last_seen ON agents(tenant_id, last_seen DESC);
CREATE INDEX idx_agents_cert_status ON agents(cert_status) WHERE cert_status != 'active';
CREATE INDEX idx_agents_cert_expiry ON agents(cert_expiry) WHERE cert_expiry IS NOT NULL;

-- ============================================================================
-- TASKS (Commands to execute on agents)
-- ============================================================================
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    -- Task Type
    task_type TEXT, -- 'embedded' or 'command'
    
    -- Embedded task (typed operations like download, upload, etc)
    embedded_type TEXT, -- download, upload, screenshot, etc
    embedded_params JSONB,
    run_once BOOLEAN DEFAULT false,
    
    -- Command task (raw shell commands)
    command TEXT,
    args JSONB, -- Array of command arguments
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'running', 'completed', 'failed', 'cancelled')),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    
    CONSTRAINT task_type_check CHECK (
        (task_type = 'embedded' AND embedded_type IS NOT NULL) OR
        (task_type = 'command' AND command IS NOT NULL) OR
        (task_type IS NULL AND command IS NOT NULL)
    )
);

-- Performance indexes
CREATE INDEX idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX idx_tasks_agent ON tasks(tenant_id, agent_id);
CREATE INDEX idx_tasks_status ON tasks(tenant_id, agent_id, status);
CREATE INDEX idx_tasks_pending ON tasks(agent_id, status) WHERE status = 'pending';
CREATE INDEX idx_tasks_created ON tasks(tenant_id, created_at DESC);

-- ============================================================================
-- RESULTS (Task execution results, 1:N relationship with tasks)
-- ============================================================================
CREATE TABLE results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- Result data
    stdout TEXT,
    stderr TEXT,
    exit_code INTEGER,
    error_message TEXT,
    
    -- Result streaming (for long-running tasks with multiple outputs)
    stream_index INTEGER DEFAULT 0,
    result_type TEXT DEFAULT 'complete' CHECK (result_type IN ('stdout', 'stderr', 'error', 'complete', 'progress')),
    
    -- Timestamp
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    
    -- Metadata
    completed BOOLEAN DEFAULT false
);

-- Performance indexes
CREATE INDEX idx_results_tenant ON results(tenant_id);
CREATE INDEX idx_results_task ON results(task_id, stream_index);
CREATE INDEX idx_results_agent ON results(tenant_id, agent_id, timestamp DESC);
CREATE INDEX idx_results_timestamp ON results(tenant_id, timestamp DESC);

-- ============================================================================
-- AUDIT LOG (Track all administrative actions)
-- ============================================================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    action TEXT NOT NULL, -- 'user_created', 'agent_registered', 'task_created', etc
    resource_type TEXT, -- 'user', 'agent', 'task', 'tenant'
    resource_id UUID,
    
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_log(tenant_id, timestamp DESC);
CREATE INDEX idx_audit_user ON audit_log(user_id, timestamp DESC);
CREATE INDEX idx_audit_action ON audit_log(action, timestamp DESC);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at column
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIAL DATA: Default Tenant
-- ============================================================================

-- Create default tenant
INSERT INTO tenants (id, name, api_key, description, active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Default',
    'default-tenant-key',
    'Default tenant created during initial setup',
    true
) ON CONFLICT (name) DO NOTHING;

-- Note: Admin user will be created by backend on first startup
-- This ensures password is properly hashed with bcrypt

-- ============================================================================
-- TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE tenants IS 'Client companies being assessed by red team';
COMMENT ON TABLE users IS 'Red team operators and administrators';
COMMENT ON TABLE user_tenants IS 'Maps which users can access which tenant data';
COMMENT ON TABLE agents IS 'Compromised hosts running Gla1v3 agents';
COMMENT ON TABLE tasks IS 'Commands queued for execution on agents';
COMMENT ON TABLE results IS 'Task execution results and output streams';
COMMENT ON TABLE audit_log IS 'Audit trail of all administrative actions';
