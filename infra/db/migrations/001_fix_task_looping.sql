-- Migration: Fix task looping issue
-- Description: Updates get_pending_tasks_for_agent to use UPDATE...RETURNING
--              to prevent returning already-sent tasks on every beacon
-- Date: 2026-02-12

-- Fix the get_pending_tasks_for_agent function to prevent task looping
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
    UPDATE tasks
    SET status = 'sent', sent_at = NOW()
    WHERE agent_id = agent_uuid
    AND status = 'pending'
    RETURNING
        id,
        task_type,
        command,
        args,
        embedded_type,
        embedded_params,
        run_once,
        created_at;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_pending_tasks_for_agent IS 'Atomically get and mark tasks as sent for an agent - prevents task looping';
