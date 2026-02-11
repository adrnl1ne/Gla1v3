-- Row-Level Security Policies for Tenant Isolation
-- Ensures operators only see data from their assigned tenants
-- Admins bypass all restrictions

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

-- Note: users and user_tenants tables don't need RLS as they're managed by admins only

-- ============================================================================
-- RLS POLICIES FOR TENANTS TABLE
-- ============================================================================

-- Admins can see all tenants
CREATE POLICY admin_all_tenants ON tenants
    FOR ALL
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = current_setting('app.current_user_id', true)::uuid
            AND users.role = 'admin'
        )
    );

-- Operators can only see their assigned tenants
CREATE POLICY operator_assigned_tenants ON tenants
    FOR SELECT
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM user_tenants
            WHERE user_tenants.tenant_id = tenants.id
            AND user_tenants.user_id = current_setting('app.current_user_id', true)::uuid
        )
    );

-- ============================================================================
-- RLS POLICIES FOR AGENTS TABLE
-- ============================================================================

-- Admins can see all agents
CREATE POLICY admin_all_agents ON agents
    FOR ALL
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = current_setting('app.current_user_id', true)::uuid
            AND users.role = 'admin'
        )
    );

-- Operators can only see agents from their assigned tenants
CREATE POLICY operator_tenant_agents ON agents
    FOR ALL
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM user_tenants
            WHERE user_tenants.tenant_id = agents.tenant_id
            AND user_tenants.user_id = current_setting('app.current_user_id', true)::uuid
        )
    );

-- ============================================================================
-- RLS POLICIES FOR TASKS TABLE
-- ============================================================================

-- Admins can see all tasks
CREATE POLICY admin_all_tasks ON tasks
    FOR ALL
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = current_setting('app.current_user_id', true)::uuid
            AND users.role = 'admin'
        )
    );

-- Operators can only see tasks from their assigned tenants
CREATE POLICY operator_tenant_tasks ON tasks
    FOR ALL
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM user_tenants
            WHERE user_tenants.tenant_id = tasks.tenant_id
            AND user_tenants.user_id = current_setting('app.current_user_id', true)::uuid
        )
    );

-- ============================================================================
-- RLS POLICIES FOR RESULTS TABLE
-- ============================================================================

-- Admins can see all results
CREATE POLICY admin_all_results ON results
    FOR ALL
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = current_setting('app.current_user_id', true)::uuid
            AND users.role = 'admin'
        )
    );

-- Operators can only see results from their assigned tenants
CREATE POLICY operator_tenant_results ON results
    FOR ALL
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM user_tenants
            WHERE user_tenants.tenant_id = results.tenant_id
            AND user_tenants.user_id = current_setting('app.current_user_id', true)::uuid
        )
    );

-- ============================================================================
-- HELPER FUNCTION: Set current user context
-- ============================================================================

CREATE OR REPLACE FUNCTION set_current_user(user_uuid UUID)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_user_id', user_uuid::text, false);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_current_user IS 'Set the current user context for RLS policies. Call this after authentication.';

-- ============================================================================
-- HELPER FUNCTION: Get current user's tenants
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_tenants(user_uuid UUID)
RETURNS TABLE(tenant_id UUID, tenant_name TEXT) AS $$
BEGIN
    -- If admin, return all tenants
    IF EXISTS (SELECT 1 FROM users WHERE id = user_uuid AND role = 'admin') THEN
        RETURN QUERY
        SELECT t.id, t.name
        FROM tenants t
        WHERE t.active = true
        ORDER BY t.name;
    ELSE
        -- If operator, return only assigned tenants
        RETURN QUERY
        SELECT t.id, t.name
        FROM tenants t
        INNER JOIN user_tenants ut ON ut.tenant_id = t.id
        WHERE ut.user_id = user_uuid
        AND t.active = true
        ORDER BY t.name;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_tenants IS 'Get all tenants accessible by a user. Admins see all, operators see assigned.';
