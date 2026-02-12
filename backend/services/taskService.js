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

    // Attach latest result (stdout / error_message) and add camelCase timestamps
    const enriched = await Promise.all(tasks.map(async (t) => {
      const latest = await ResultModel.getLatestForTask(t.id);
      return {
        ...t,
        // API consumers expect `result` and `error` keys
        result: latest ? latest.stdout : null,
        error: latest ? latest.error_message : null,
        // Provide camelCase timestamp aliases used by the frontend
        createdAt: t.created_at || null,
        completedAt: t.completed_at || null
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
