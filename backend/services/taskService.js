// Task Service
const TaskModel = require('../models/Task');

class TaskService {
  static async createTask(agentId, taskData, tenantId, createdBy = null) {
    return await TaskModel.create(agentId, taskData, tenantId, createdBy);
  }
  
  static async getPendingTasks(agentId) {
    return await TaskModel.getPendingForAgent(agentId);
  }
  
  static async getAllTasks(agentId) {
    const tasks = await TaskModel.getAllForAgent(agentId);
    const ResultModel = require('../models/Result');

    // Attach latest result (stdout / error_message) and normalize field names
    const enriched = await Promise.all(tasks.map(async (t) => {
      const latest = await ResultModel.getLatestForTask(t.id);
      return {
        ...t,
        // API consumers expect `result` and `error` keys
        result: latest ? latest.stdout : null,
        error: latest ? latest.error_message : null,
        // Provide camelCase timestamp aliases used by the frontend
        createdAt: t.created_at || null,
        completedAt: t.completed_at || null,
        // Normalize field names for frontend (camelCase)
        // Add explicit `type` so frontend can detect embedded vs command reliably
        type: t.task_type || (t.embedded_type ? 'embedded' : 'command'),
        taskType: t.task_type || t.taskType || null,
        embeddedType: t.embedded_type || t.embeddedType || null,
        cmd: t.command || t.cmd || null,
        // Keep both snake_case and camelCase for compatibility
        task_type: t.task_type,
        embedded_type: t.embedded_type,
        command: t.command
      };
    }));

    return enriched;
  }
  
  static async updateTaskResult(agentId, taskId, result, error = null) {
    return await TaskModel.updateResult(agentId, taskId, result, error);
  }
  
  static async getByTenant(tenantId) {
    return await TaskModel.getByTenant(tenantId);
  }
}

module.exports = TaskService;
