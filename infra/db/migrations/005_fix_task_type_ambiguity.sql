-- Fix ambiguous column reference in get_pending_tasks_for_agent function
-- The task_type column reference was ambiguous between PL/pgSQL variable and table column

DROP FUNCTION IF EXISTS get_pending_tasks_for_agent(uuid);

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
            tasks.task_type,  -- Qualify with table name to avoid ambiguity
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