-- Helper Functions for Common Operations

-- ============================================================================
-- AGENT FUNCTIONS
-- ============================================================================

-- Update agent last_seen timestamp
CREATE OR REPLACE FUNCTION update_agent_last_seen(agent_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE agents
    SET last_seen = NOW()
    WHERE id = agent_uuid;
END;
$$ LANGUAGE plpgsql;

-- Mark old agents as inactive
CREATE OR REPLACE FUNCTION mark_stale_agents_inactive(stale_minutes INTEGER DEFAULT 60)
RETURNS INTEGER AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    UPDATE agents
    SET status = 'inactive'
    WHERE status = 'active'
    AND last_seen < NOW() - (stale_minutes || ' minutes')::INTERVAL;
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_stale_agents_inactive IS 'Mark agents that haven''t checked in as inactive';

-- Check certificate expiry
CREATE OR REPLACE FUNCTION get_expiring_certificates(days_threshold INTEGER DEFAULT 30)
RETURNS TABLE(
    agent_id UUID,
    hostname TEXT,
    cert_fingerprint TEXT,
    cert_expiry TIMESTAMPTZ,
    days_remaining INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id,
        a.hostname,
        a.cert_fingerprint,
        a.cert_expiry,
        EXTRACT(DAY FROM (a.cert_expiry - NOW()))::INTEGER as days_remaining
    FROM agents a
    WHERE a.cert_expiry IS NOT NULL
    AND a.cert_expiry <= NOW() + (days_threshold || ' days')::INTERVAL
    AND a.cert_status = 'active'
    ORDER BY a.cert_expiry ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_expiring_certificates IS 'Get agents with certificates expiring soon';

-- ============================================================================
-- TASK FUNCTIONS
-- ============================================================================

-- Get pending tasks for agent
CREATE OR REPLACE FUNCTION get_pending_tasks_for_agent(agent_uuid UUID)
RETURNS TABLE(
    task_id UUID,
    task_type TEXT,
    command TEXT,
    args JSONB,
    embedded_type TEXT,
    embedded_params JSONB,
    run_once BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Mark tasks as sent and return them atomically
    -- This prevents returning the same task multiple times
    RETURN QUERY
    WITH updated_tasks AS (
        UPDATE tasks
        SET status = 'sent', sent_at = NOW()
        WHERE agent_id = agent_uuid
        AND status = 'pending'
        RETURNING
            tasks.id,
            tasks.task_type,
            tasks.command,
            tasks.args,
            tasks.embedded_type,
            tasks.embedded_params,
            tasks.run_once,
            tasks.created_at
    )
    SELECT * FROM updated_tasks ORDER BY created_at ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_pending_tasks_for_agent IS 'Atomically get and mark tasks as sent for an agent';

-- Complete task with result
CREATE OR REPLACE FUNCTION complete_task(
    task_uuid UUID,
    task_stdout TEXT DEFAULT NULL,
    task_stderr TEXT DEFAULT NULL,
    task_exit_code INTEGER DEFAULT NULL,
    task_error TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    result_uuid UUID;
    task_tenant_id UUID;
    task_agent_id UUID;
BEGIN
    -- Get task details
    SELECT tenant_id, agent_id INTO task_tenant_id, task_agent_id
    FROM tasks WHERE id = task_uuid;
    
    -- Update task status (treat empty-string errors as no-error)
    UPDATE tasks
    SET 
        status = CASE WHEN task_error IS NOT NULL AND length(trim(task_error)) > 0 THEN 'failed' ELSE 'completed' END,
        completed_at = NOW()
    WHERE id = task_uuid;
    
    -- Insert result
    INSERT INTO results (
        tenant_id,
        agent_id,
        task_id,
        stdout,
        stderr,
        exit_code,
        error_message,
        completed,
        result_type
    ) VALUES (
        task_tenant_id,
        task_agent_id,
        task_uuid,
        task_stdout,
        task_stderr,
        task_exit_code,
        task_error,
        true,
        'complete'
    ) RETURNING id INTO result_uuid;
    
    RETURN result_uuid;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION complete_task IS 'Mark task as complete and store result';

-- ============================================================================
-- STATISTICS FUNCTIONS
-- ============================================================================

-- Get tenant statistics
CREATE OR REPLACE FUNCTION get_tenant_stats(tenant_uuid UUID)
RETURNS TABLE(
    total_agents BIGINT,
    active_agents BIGINT,
    inactive_agents BIGINT,
    total_tasks BIGINT,
    pending_tasks BIGINT,
    completed_tasks BIGINT,
    failed_tasks BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT a.id),
        COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'active'),
        COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'inactive'),
        COUNT(DISTINCT t.id),
        COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('pending', 'sent')),
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed'),
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'failed')
    FROM tenants tn
    LEFT JOIN agents a ON a.tenant_id = tn.id
    LEFT JOIN tasks t ON t.tenant_id = tn.id
    WHERE tn.id = tenant_uuid
    GROUP BY tn.id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_tenant_stats IS 'Get statistics for a specific tenant';

-- ============================================================================
-- AUDIT LOGGING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION log_audit(
    p_user_id UUID,
    p_tenant_id UUID,
    p_action TEXT,
    p_resource_type TEXT DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO audit_log (
        user_id,
        tenant_id,
        action,
        resource_type,
        resource_id,
        details,
        ip_address,
        user_agent
    ) VALUES (
        p_user_id,
        p_tenant_id,
        p_action,
        p_resource_type,
        p_resource_id,
        p_details,
        p_ip_address,
        p_user_agent
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_audit IS 'Log an audit event';
