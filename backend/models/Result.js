// Result Model - Task execution results
const { query } = require('../db/connection');

class ResultModel {
  // Create a new result for a task
  static async create(resultData) {
    const result = await query(
      `INSERT INTO results (
        tenant_id, agent_id, task_id, stdout, stderr, exit_code, 
        error_message, stream_index, result_type, completed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        resultData.tenantId,
        resultData.agentId,
        resultData.taskId,
        resultData.stdout || null,
        resultData.stderr || null,
        resultData.exitCode !== undefined ? resultData.exitCode : null,
        resultData.errorMessage || null,
        resultData.streamIndex || 0,
        resultData.resultType || 'complete',
        resultData.completed !== undefined ? resultData.completed : true
      ]
    );
    
    return result.rows[0];
  }
  
  // Get all results for a specific task
  static async getByTask(taskId) {
    const result = await query(
      'SELECT * FROM results WHERE task_id = $1 ORDER BY stream_index ASC, timestamp ASC',
      [taskId]
    );
    return result.rows;
  }
  
  // Get all results for an agent
  static async getByAgent(agentId, limit = 100) {
    const result = await query(
      `SELECT * FROM results 
       WHERE agent_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [agentId, limit]
    );
    return result.rows;
  }
  
  // Get results for a tenant
  static async getByTenant(tenantId, limit = 100) {
    const result = await query(
      `SELECT r.*, t.command, t.task_type, a.hostname
       FROM results r
       INNER JOIN tasks t ON t.id = r.task_id
       INNER JOIN agents a ON a.id = r.agent_id
       WHERE r.tenant_id = $1
       ORDER BY r.timestamp DESC
       LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows;
  }
  
  // Get a specific result by ID
  static async findById(resultId) {
    const result = await query(
      'SELECT * FROM results WHERE id = $1',
      [resultId]
    );
    return result.rows[0] || null;
  }
  
  // Get the latest result for a task
  static async getLatestForTask(taskId) {
    const result = await query(
      `SELECT * FROM results 
       WHERE task_id = $1 
       ORDER BY stream_index DESC, timestamp DESC 
       LIMIT 1`,
      [taskId]
    );
    return result.rows[0] || null;
  }
  
  // Add a streaming result (for long-running tasks)
  static async addStreamResult(taskId, resultData) {
    // Get the current max stream_index for this task
    const maxIndex = await query(
      'SELECT COALESCE(MAX(stream_index), -1) as max_index FROM results WHERE task_id = $1',
      [taskId]
    );
    
    const nextIndex = maxIndex.rows[0].max_index + 1;
    
    const result = await query(
      `INSERT INTO results (
        tenant_id, agent_id, task_id, stdout, stderr, 
        stream_index, result_type, completed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        resultData.tenantId,
        resultData.agentId,
        taskId,
        resultData.stdout || null,
        resultData.stderr || null,
        nextIndex,
        resultData.resultType || 'stdout',
        false // Streaming results are not complete
      ]
    );
    
    return result.rows[0];
  }
  
  // Mark all results for a task as completed
  static async markTaskComplete(taskId) {
    const result = await query(
      'UPDATE results SET completed = true WHERE task_id = $1 AND completed = false',
      [taskId]
    );
    return result.rowCount;
  }
  
  // Delete results for a task
  static async deleteByTask(taskId) {
    const result = await query(
      'DELETE FROM results WHERE task_id = $1',
      [taskId]
    );
    return result.rowCount;
  }
  
  // Delete old results (cleanup)
  static async deleteOlderThan(days = 30) {
    const result = await query(
      `DELETE FROM results 
       WHERE timestamp < NOW() - INTERVAL '${days} days'
       RETURNING id`,
    );
    
    if (result.rowCount > 0) {
      console.log(`[RESULT] Cleaned up ${result.rowCount} old results (older than ${days} days)`);
    }
    
    return result.rowCount;
  }
  
  // Get result statistics for a tenant
  static async getStats(tenantId) {
    const result = await query(
      `SELECT 
        COUNT(*) as total_results,
        COUNT(*) FILTER (WHERE completed = true) as completed_results,
        COUNT(*) FILTER (WHERE exit_code = 0) as successful_results,
        COUNT(*) FILTER (WHERE exit_code != 0 OR error_message IS NOT NULL) as failed_results
       FROM results 
       WHERE tenant_id = $1`,
      [tenantId]
    );
    return result.rows[0];
  }
}

module.exports = ResultModel;
