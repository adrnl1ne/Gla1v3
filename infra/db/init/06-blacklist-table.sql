-- Blacklist table for persistent blacklist storage
-- This provides persistence across Redis restarts
-- agent_id can be either the agent UUID or CN (certificate common name) for flexibility

CREATE TABLE IF NOT EXISTS agent_blacklist (
    id SERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL,
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
    CONSTRAINT unique_active_blacklist UNIQUE (agent_id, tenant_id, revoked)
);

CREATE INDEX idx_agent_blacklist_agent ON agent_blacklist(agent_id);
CREATE INDEX idx_agent_blacklist_tenant ON agent_blacklist(tenant_id);
CREATE INDEX idx_agent_blacklist_revoked ON agent_blacklist(revoked) WHERE revoked = false;
CREATE INDEX idx_agent_blacklist_expires ON agent_blacklist(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE agent_blacklist IS 'Persistent storage for agent blacklist entries with TTL and revocation support';
COMMENT ON COLUMN agent_blacklist.agent_id IS 'Agent identifier (can be UUID from agents.id or CN from certificate)';
COMMENT ON COLUMN agent_blacklist.revoked IS 'Whether this blacklist entry was manually revoked before expiry';
