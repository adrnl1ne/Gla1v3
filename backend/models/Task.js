// Task Model - PostgreSQL Version
const crypto = require('crypto');
const { query } = require('../db/connection');

class TaskModel {
  static async create(agentId, taskData, tenantId, createdBy = null) {
    // Decide whether this is an embedded task or a shell/command task.
    // Older callers sometimes set `taskType: 'command'` for commands — treat that as a command,
    // and only treat a task as "embedded" when `type === 'embedded'` OR taskType explicitly
    // identifies an embedded action (i.e. not the literal string 'command').
    const isEmbedded = taskData.type === 'embedded' || (typeof taskData.taskType === 'string' && taskData.taskType !== 'command');

    if (isEmbedded) {
      const result = await query(
        `INSERT INTO tasks (
          tenant_id, agent_id, task_type, embedded_type, embedded_params, run_once, created_by, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          tenantId,
          agentId,
          'embedded',
          taskData.taskType,
          JSON.stringify(taskData.params || {}),
          taskData.runOnce || false,
          createdBy,
          'pending'
        ]
      );

      console.log(`[TASK] Created embedded task: ${result.rows[0].id} for agent ${agentId}`);
      return result.rows[0];
    }

    // Otherwise treat as a command task
    const result = await query(
      `INSERT INTO tasks (
        tenant_id, agent_id, task_type, command, args, created_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        tenantId,
        agentId,
        'command',
        taskData.cmd,
        JSON.stringify(taskData.args || []),
        createdBy,
        'pending'
      ]
    );

    console.log(`[TASK] Created command task: ${result.rows[0].id} for agent ${agentId}`);
    return result.rows[0];
  }

  static async getPendingForAgent(agentId) {
    const result = await query(
      'SELECT * FROM get_pending_tasks_for_agent($1)',
      [agentId]
    );
    return result.rows;
  }
  
  static async getAllForAgent(agentId) {
    const result = await query(
      'SELECT * FROM tasks WHERE agent_id = $1 ORDER BY created_at DESC',
      [agentId]
    );
    return result.rows;
  }
  
  static async getByTenant(tenantId) {
    const result = await query(
      'SELECT * FROM tasks WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    return result.rows;
  }
  
  static async findById(taskId) {
    const result = await query(
      'SELECT * FROM tasks WHERE id = $1',
      [taskId]
    );
    return result.rows[0] || null;
  }
  
  static async updateStatus(taskId, status) {
    // Build SET clause dynamically to avoid trailing commas when optional fields
    const sets = ["status = $1"];
    if (status === 'running') sets.push('executed_at = NOW()');
    if (status === 'completed' || status === 'failed') sets.push('completed_at = NOW()');

    const setClause = sets.join(', ');

    const result = await query(
      `UPDATE tasks SET ${setClause} WHERE id = $2 RETURNING *`,
      [status, taskId]
    );
    return result.rows[0] || null;
  }
  
  static async updateResult(agentId, taskId, result, error = null) {
    // Normalize empty-string errors to NULL so the DB doesn't treat "" as an actual error
    const dbError = (typeof error === 'string' && error.trim().length === 0) ? null : error;

    // Use the complete_task function which handles both task update and result insertion
    const queryResult = await query(
      'SELECT complete_task($1, $2, $3, NULL, $4)',
      [
        taskId,
        typeof result === 'string' ? result : JSON.stringify(result),
        null, // stderr
        dbError
      ]
    );
    
    // Get the updated task
    const task = await TaskModel.findById(taskId);
    return task;
  }
  
  static async delete(taskId) {
    const result = await query(
      'DELETE FROM tasks WHERE id = $1 RETURNING id',
      [taskId]
    );
    
    if (result.rows[0]) {
      console.log(`[TASK] Deleted: ${taskId}`);
    }
    
    return result.rowCount > 0;
  }
  
  static async getByStatus(status, tenantId = null) {
    let sql = 'SELECT * FROM tasks WHERE status = $1';
    const params = [status];
    
    if (tenantId) {
      sql += ' AND tenant_id = $2';
      params.push(tenantId);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const result = await query(sql, params);
    return result.rows;
  }
  
  static async getAll(tenantId = null) {
    let sql = 'SELECT * FROM tasks';
    const params = [];
    
    if (tenantId) {
      sql += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const result = await query(sql, params);
    return result.rows;
  }
}

module.exports = TaskModel;
