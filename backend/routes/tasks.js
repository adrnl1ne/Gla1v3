// Task Routes
const express = require('express');
const router = express.Router();
const TaskService = require('../services/taskService');
const AgentService = require('../services/agentService');
const TenantModel = require('../models/Tenant');
const TaskModel = require('../models/Task');
const taskQueueService = require('../services/taskQueueService');
const { auditAction } = require('../middleware/audit');

// Get recent tasks (for dashboard)
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const tenantId = req.query.tenant_id;
    
    console.log(`[TASKS] /recent endpoint called with tenantId: ${tenantId}, limit: ${limit}`);
    
    let tasks = await TaskModel.getAll(tenantId);
    
    // Apply limit
    tasks = tasks.slice(0, limit);
    
    console.log(`[TASKS] /recent returning ${tasks.length} tasks`);
    res.json(tasks);
  } catch (err) {
    console.error('Error getting recent tasks:', err);
    res.status(500).json({ error: 'Failed to retrieve recent tasks' });
  }
});

// Create task for agent
router.post('/', auditAction('create_task'), async (req, res) => {
  try {
    const { agentId, cmd, args, tenantId } = req.body;
    
    if (!agentId || !cmd) {
      return res.status(400).json({ error: 'agentId and cmd required' });
    }
    
    const agent = await AgentService.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Use agent's tenant if not specified
    const taskTenantId = tenantId || agent.tenant_id;
    
    const task = await TaskService.createTask(agentId, { cmd, args }, taskTenantId);
    
    // Enqueue task in Redis for faster delivery
    try {
      await taskQueueService.enqueueTask(agentId, task, taskTenantId);
      console.log(`[TASK] Created and enqueued task ${task.id} for agent ${agentId}: ${cmd}`);
    } catch (redisErr) {
      console.warn('[TASK] Redis enqueue failed, task will be delivered via SQL polling:', redisErr.message);
    }
    
    res.status(201).json(task);
  } catch (err) {
    console.error('Task creation error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Get pending tasks for agent (called by agent)
router.get('/pending/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Prevent "recent" from being treated as an agent ID
    if (agentId === 'recent') {
      return res.status(400).json({ error: 'Invalid agent ID: recent is a reserved keyword' });
    }
    
    const tasks = await TaskService.getPendingTasks(agentId);
    res.json(tasks);
  } catch (err) {
    console.error('Error getting pending tasks:', err);
    if (err.message && err.message.includes('invalid input syntax for type uuid')) {
      return res.status(400).json({ error: 'Invalid agent ID format' });
    }
    res.status(500).json({ error: 'Failed to retrieve tasks' });
  }
});

// Get all tasks for agent
router.get('/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Prevent "recent" from being treated as an agent ID
    if (agentId === 'recent') {
      return res.status(400).json({ error: 'Invalid agent ID: recent is a reserved keyword' });
    }
    
    const tasks = await TaskService.getAllTasks(agentId);
    res.json(tasks);
  } catch (err) {
    console.error('Error getting tasks:', err);
    if (err.message && err.message.includes('invalid input syntax for type uuid')) {
      return res.status(400).json({ error: 'Invalid agent ID format' });
    }
    res.status(500).json({ error: 'Failed to retrieve tasks' });
  }
});

// Update task result (called by agent)
router.post('/result', async (req, res) => {
  try {
    const { agentId, taskId, result, error } = req.body;
    
    if (!agentId || !taskId) {
      return res.status(400).json({ error: 'agentId and taskId required' });
    }
    
    // Mark task as completed in Redis queue
    try {
      const agent = await AgentService.getAgent(agentId);
      if (agent) {
        await taskQueueService.completeTask(agentId, taskId, agent.tenant_id);
      }
    } catch (redisErr) {
      console.warn('[TASK] Redis complete failed:', redisErr.message);
    }
    
    const task = await TaskService.updateTaskResult(agentId, taskId, result, error);
    
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
