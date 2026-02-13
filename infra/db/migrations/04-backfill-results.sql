-- Backfill results for completed tasks that have no corresponding `results` rows
-- Idempotent: will only insert for tasks that currently have zero results
-- Usage: run against the production/dev DB after review

BEGIN;

WITH candidates AS (
  SELECT t.id as task_id, t.tenant_id, t.agent_id, t.completed_at, t.command
  FROM tasks t
  LEFT JOIN results r ON r.task_id = t.id
  WHERE t.status = 'completed'
    AND r.id IS NULL
)
INSERT INTO results (
  tenant_id, agent_id, task_id, stdout, stderr, exit_code, error_message, stream_index, result_type, timestamp, completed
)
SELECT
  c.tenant_id,
  c.agent_id,
  c.task_id,
  NULL::text AS stdout,
  NULL::text AS stderr,
  NULL::integer AS exit_code,
  NULL::text AS error_message,
  0 AS stream_index,
  'complete'::text AS result_type,
  COALESCE(c.completed_at, NOW())::timestamptz AS timestamp,
  true AS completed
FROM candidates c
WHERE NOT EXISTS (
  SELECT 1 FROM results r WHERE r.task_id = c.task_id
);

-- Return number inserted
SELECT COUNT(*) AS inserted FROM results WHERE result_type = 'complete' AND stream_index = 0 AND stdout IS NULL AND task_id IN (SELECT id FROM tasks WHERE status = 'completed');

COMMIT;