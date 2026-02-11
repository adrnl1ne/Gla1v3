-- Blacklist table for persistent blacklist storage
-- This provides persistence across Redis restarts

CREATE TABLE IF NOT EXISTS agent_blacklist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    blacklisted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    blacklisted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_active_blacklist UNIQUE (agent_id, tenant_id) WHERE (revoked = false)
);

CREATE INDEX idx_agent_blacklist_agent ON agent_blacklist(agent_id);
CREATE INDEX idx_agent_blacklist_tenant ON agent_blacklist(tenant_id);
CREATE INDEX idx_agent_blacklist_revoked ON agent_blacklist(revoked);
CREATE INDEX idx_agent_blacklist_expires ON agent_blacklist(expires_at);

COMMENT ON TABLE agent_blacklist IS 'Persistent storage for agent blacklist entries with TTL and revocation support';
COMMENT ON COLUMN agent_blacklist.revoked IS 'Whether this blacklist entry was manually revoked before expiry';
