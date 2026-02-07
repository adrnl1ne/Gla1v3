// Task Model
const crypto = require('crypto');

// In-memory storage (will be replaced with DB)
const taskQueue = new Map();

class TaskModel {
  static create(agentId, taskData) {
    const task = {
      id: crypto.randomBytes(8).toString('hex'),
      agentId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      result: null
    };
    
    // Handle embedded task format
    if (taskData.type === 'embedded' || taskData.taskType) {
      task.type = 'embedded';
      task.taskType = taskData.taskType;
      task.params = taskData.params || {};
      task.runOnce = taskData.runOnce || false;
    }
    // Handle command task format
    else {
      task.cmd = taskData.cmd;
      task.args = taskData.args || [];
    }
    
    if (!taskQueue.has(agentId)) {
      taskQueue.set(agentId, []);
    }
    
    taskQueue.get(agentId).push(task);
    return task;
  }
  
  static getPendingForAgent(agentId) {
    const tasks = taskQueue.get(agentId) || [];
    return tasks.filter(t => t.status === 'pending');
  }
  
  static getAllForAgent(agentId) {
    return taskQueue.get(agentId) || [];
  }
  
  static updateResult(agentId, taskId, result, error = null) {
    const tasks = taskQueue.get(agentId);
    if (!tasks) return null;
    
    const task = tasks.find(t => t.id === taskId);
    if (!task) return null;
    
    task.status = error ? 'failed' : 'completed';
    task.result = result;
    task.error = error;
    task.completedAt = new Date().toISOString();
    
    return task;
  }
  
  static getStore() {
    return taskQueue;
  }
}

module.exports = TaskModel;
