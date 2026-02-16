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

-- Allow service-level tenant lookups (no user context needed) for agent beacons
CREATE POLICY service_tenant_access ON tenants
    FOR SELECT
    TO PUBLIC
    USING (current_setting('app.current_user_id', true) IS NULL);

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

-- Allow service-level agent operations (beacons, registration) without user context
CREATE POLICY service_agent_access ON agents
    FOR ALL
    TO PUBLIC
    USING (current_setting('app.current_user_id', true) IS NULL)
    WITH CHECK (current_setting('app.current_user_id', true) IS NULL);

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

--Operators can only see tasks from their assigned tenants
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

-- Allow service-level task operations without user context (for agent beacons)
CREATE POLICY service_task_access ON tasks
    FOR ALL
    TO PUBLIC
    USING (current_setting('app.current_user_id', true) IS NULL)
    WITH CHECK (current_setting('app.current_user_id', true) IS NULL);

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

-- Allow service-level result operations without user context (for agent task results)
CREATE POLICY service_result_access ON results
    FOR ALL
    TO PUBLIC
    USING (current_setting('app.current_user_id', true) IS NULL)
    WITH CHECK (current_setting('app.current_user_id', true) IS NULL);

-- ============================================================================
-- HELPER FUNCTION: Set current user context
-- ============================================================================

CREATE OR REPLACE FUNCTION set_current_user(user_uuid UUID)
RETURNS void AS $$
BEGIN
    -- Set for transaction (false = transaction-local, will be cleared after transaction)
    -- The application should use queryWithContext() to ensure proper context per query
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

-- ============================================================================
-- RLS POLICIES FOR AGENT_BLACKLIST TABLE (applies when `agent_blacklist` exists in the schema — canonical definition in `01-schema.sql`)
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'agent_blacklist') THEN
        -- Enable RLS
        ALTER TABLE agent_blacklist ENABLE ROW LEVEL SECURITY;
        
        -- Admins can see all blacklist entries
        CREATE POLICY admin_all_blacklist ON agent_blacklist
            FOR ALL
            TO PUBLIC
            USING (
                EXISTS (
                    SELECT 1 FROM users
                    WHERE users.id = current_setting('app.current_user_id', true)::uuid
                    AND users.role = 'admin'
                )
            );
        
        -- Operators can only see blacklist entries from their assigned tenants
        CREATE POLICY operator_tenant_blacklist ON agent_blacklist
            FOR ALL
            TO PUBLIC
            USING (
                EXISTS (
                    SELECT 1 FROM user_tenants
                    WHERE user_tenants.tenant_id = agent_blacklist.tenant_id
                    AND user_tenants.user_id = current_setting('app.current_user_id', true)::uuid
                )
            );
        
        -- Allow service-level blacklist operations without user context
        CREATE POLICY service_blacklist_access ON agent_blacklist
            FOR ALL
            TO PUBLIC
            USING (current_setting('app.current_user_id', true) IS NULL)
            WITH CHECK (current_setting('app.current_user_id', true) IS NULL);
    END IF;
END $$;

