// Task Routes
const express = require('express');
const router = express.Router();
const TaskService = require('../services/taskService');
const AgentService = require('../services/agentService');
const { auditAction } = require('../middleware/audit');

// Create task for agent
router.post('/', auditAction('create_task'), (req, res) => {
  try {
    const { agentId, cmd, args } = req.body;
    
    if (!agentId || !cmd) {
      return res.status(400).json({ error: 'agentId and cmd required' });
    }
    
    const agent = AgentService.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const task = TaskService.createTask(agentId, { cmd, args });
    
    console.log(`[TASK] Created task ${task.id} for agent ${agentId}: ${cmd}`);
    
    res.status(201).json(task);
  } catch (err) {
    console.error('Task creation error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Get pending tasks for agent (called by agent)
router.get('/pending/:agentId', (req, res) => {
  const { agentId } = req.params;
  const tasks = TaskService.getPendingTasks(agentId);
  res.json(tasks);
});

// Get all tasks for agent
router.get('/:agentId', (req, res) => {
  const { agentId } = req.params;
  const tasks = TaskService.getAllTasks(agentId);
  res.json(tasks);
});

// Update task result (called by agent)
router.post('/result', (req, res) => {
  try {
    const { agentId, taskId, result, error } = req.body;
    
    if (!agentId || !taskId) {
      return res.status(400).json({ error: 'agentId and taskId required' });
    }
    
    const task = TaskService.updateTaskResult(agentId, taskId, result, error);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    console.log(`[TASK] Task ${taskId} completed: ${task.status}`);
    
    res.json(task);
  } catch (err) {
    console.error('Task result error:', err);
    res.status(500).json({ error: 'Failed to update task result' });
  }
});

module.exports = router;
