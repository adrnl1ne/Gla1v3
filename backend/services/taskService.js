// Task Service
const TaskModel = require('../models/Task');

class TaskService {
  static createTask(agentId, taskData) {
    return TaskModel.create(agentId, taskData);
  }
  
  static getPendingTasks(agentId) {
    return TaskModel.getPendingForAgent(agentId);
  }
  
  static getAllTasks(agentId) {
    return TaskModel.getAllForAgent(agentId);
  }
  
  static updateTaskResult(agentId, taskId, result, error = null) {
    return TaskModel.updateResult(agentId, taskId, result, error);
  }
}

module.exports = TaskService;
