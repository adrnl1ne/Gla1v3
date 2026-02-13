/*
  Backfill script: inserts an empty `results` row for completed tasks that currently
  lack any results. Safe & idempotent.

  Usage:
    node backend/scripts/backfill_results.js         # runs (requires DB env)
    node backend/scripts/backfill_results.js --dry   # preview only
*/

const db = require('../db/connection');

async function preview() {
  const res = await db.query(
    `SELECT COUNT(*) AS cnt FROM tasks t LEFT JOIN results r ON r.task_id = t.id WHERE t.status = 'completed' AND r.id IS NULL`
  );
  return parseInt(res.rows[0].cnt, 10);
}

async function runBackfill() {
  const sql = `WITH candidates AS (
    SELECT t.id as task_id, t.tenant_id, t.agent_id, t.completed_at
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
  );`;

  const res = await db.query('BEGIN');
  try {
    const insertRes = await db.query(sql);
    // Count inserted (best-effort)
    const cnt = await db.query(`SELECT COUNT(*) AS cnt FROM tasks t LEFT JOIN results r ON r.task_id = t.id WHERE t.status = 'completed' AND r.id IS NOT NULL`);
    await db.query('COMMIT');
    return insertRes.rowCount || 0;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

(async () => {
  const dry = process.argv.includes('--dry');
  try {
    const pending = await preview();
    console.log(`Tasks eligible for backfill: ${pending}`);
    if (pending === 0) {
      console.log('Nothing to do.');
      process.exit(0);
    }

    if (dry) {
      console.log('Dry-run: no changes made.');
      process.exit(0);
    }

    console.log('Performing backfill (this will insert placeholder results for missing outputs)...');
    const inserted = await runBackfill();
    console.log(`Backfill completed. Inserted ~${inserted} rows (best-effort).`);
    process.exit(0);
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(2);
  }
})();