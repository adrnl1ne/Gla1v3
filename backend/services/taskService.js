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
    return await TaskModel.getAllForAgent(agentId);
  }
  
  static async updateTaskResult(agentId, taskId, result, error = null) {
    return await TaskModel.updateResult(agentId, taskId, result, error);
  }
  
  static async getByTenant(tenantId) {
    return await TaskModel.getByTenant(tenantId);
  }
}

module.exports = TaskService;
