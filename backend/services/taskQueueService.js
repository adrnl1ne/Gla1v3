const redisClient = require('../utils/redisClient');

class TaskQueueService {
  constructor() {
    this.activeSubscriptions = new Map();
  }

  /**
   * Add a task to an agent's queue
   * @param {string} agentId - The agent ID
   * @param {object} task - The task object
   * @param {number} tenantId - The tenant ID
   */
  async enqueueTask(agentId, task, tenantId) {
    try {
      const queueKey = redisClient.getKey('queue:agent', agentId, tenantId);
      // Normalize command alias so agents always receive `cmd` (legacy DB uses `command`).
      const normalizedTask = Object.assign({}, task);
      if (!normalizedTask.cmd && normalizedTask.command) {
        normalizedTask.cmd = normalizedTask.command;
      }
      const taskData = JSON.stringify({
        ...normalizedTask,
        enqueuedAt: new Date().toISOString()
      });

      // Add to agent's task queue
      await redisClient.rPush(queueKey, taskData);

      // Publish notification to agent-specific channel
      const channel = redisClient.getKey('channel:agent', agentId, tenantId);
      await redisClient.publish(channel, JSON.stringify({
        type: 'NEW_TASK',
        agentId,
        taskId: task.id || task.task_id,
        timestamp: new Date().toISOString()
      }));

      console.log(`📬 Task ${task.id || task.task_id} enqueued for agent ${agentId}`);

      return { success: true, queueLength: await this.getQueueLength(agentId, tenantId) };
    } catch (error) {
      console.error('Error enqueueing task:', error);
      throw error;
    }
  }

  /**
   * Dequeue (fetch) the next task for an agent
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   */
  async dequeueTask(agentId, tenantId) {
    try {
      const queueKey = redisClient.getKey('queue:agent', agentId, tenantId);
      const taskData = await redisClient.lPop(queueKey);

      if (!taskData) {
        return null;
      }

      const task = JSON.parse(taskData);
      
      // Store in processing set with timeout
      const processingKey = redisClient.getKey('processing:agent', agentId, tenantId);
      const taskId = task.id || task.task_id;
      await redisClient.hSet(processingKey, taskId, JSON.stringify({
        task,
        dequeuedAt: new Date().toISOString()
      }));
      await redisClient.expire(processingKey, 3600); // 1 hour processing timeout

      console.log(`📤 Task ${taskId} dequeued by agent ${agentId}`);

      return task;
    } catch (error) {
      console.error('Error dequeuing task:', error);
      throw error;
    }
  }

  /**
   * Mark a task as completed and remove from processing
   * @param {string} agentId - The agent ID
   * @param {string} taskId - The task ID
   * @param {number} tenantId - The tenant ID
   */
  async completeTask(agentId, taskId, tenantId) {
    try {
      const processingKey = redisClient.getKey('processing:agent', agentId, tenantId);
      await redisClient.hDel(processingKey, taskId);

      console.log(`✅ Task ${taskId} completed by agent ${agentId}`);
      return { success: true };
    } catch (error) {
      console.error('Error completing task:', error);
      throw error;
    }
  }

  /**
   * Get the length of an agent's task queue
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   */
  async getQueueLength(agentId, tenantId) {
    try {
      const queueKey = redisClient.getKey('queue:agent', agentId, tenantId);
      return await redisClient.lLen(queueKey);
    } catch (error) {
      console.error('Error getting queue length:', error);
      return 0;
    }
  }

  /**
   * Get all pending tasks for an agent (without dequeueing)
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   */
  async getPendingTasks(agentId, tenantId) {
    try {
      const queueKey = redisClient.getKey('queue:agent', agentId, tenantId);
      const tasksData = await redisClient.lRange(queueKey, 0, -1);

      return tasksData.map(taskData => JSON.parse(taskData));
    } catch (error) {
      console.error('Error getting pending tasks:', error);
      return [];
    }
  }

  /**
   * Remove a specific task from an agent queue (used when agent reports completion)
   * This finds the queued JSON item whose id matches taskId and removes it from the list.
   */
  async removeTaskFromQueue(agentId, tenantId, taskId) {
    try {
      const queueKey = redisClient.getKey('queue:agent', agentId, tenantId);
      const items = await redisClient.lRange(queueKey, 0, -1);

      for (const item of items) {
        try {
          const parsed = JSON.parse(item);
          const id = parsed.id || parsed.task_id;
          if (id === taskId) {
            // Remove the exact serialized list element (one occurrence)
            await redisClient.lRem(queueKey, 1, item);
            console.log(`🧹 Removed task ${taskId} from Redis queue for agent ${agentId}`);
            return { removed: true };
          }
        } catch (err) {
          // ignore parse errors and continue
        }
      }

      return { removed: false };
    } catch (error) {
      console.error('Error removing task from queue:', error);
      return { removed: false, error };
    }
  }

  /**
   * Get tasks currently being processed by an agent
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   */
  async getProcessingTasks(agentId, tenantId) {
    try {
      const processingKey = redisClient.getKey('processing:agent', agentId, tenantId);
      const tasksData = await redisClient.hGetAll(processingKey);

      return Object.entries(tasksData).map(([taskId, data]) => {
        const parsed = JSON.parse(data);
        return {
          taskId,
          ...parsed
        };
      });
    } catch (error) {
      console.error('Error getting processing tasks:', error);
      return [];
    }
  }

  /**
   * Subscribe to task notifications for an agent
   * Used by long-polling or WebSocket connections
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   * @param {function} callback - Callback function when new task arrives
   */
  async subscribeToAgentTasks(agentId, tenantId, callback) {
    try {
      const channel = redisClient.getKey('channel:agent', agentId, tenantId);
      
      await redisClient.subscribe(channel, (message) => {
        try {
          const notification = JSON.parse(message);
          callback(notification);
        } catch (err) {
          console.error('Error parsing task notification:', err);
        }
      });

      this.activeSubscriptions.set(`${tenantId}:${agentId}`, channel);

      console.log(`🔔 Agent ${agentId} subscribed to task notifications`);
    } catch (error) {
      console.error('Error subscribing to agent tasks:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from task notifications
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   */
  async unsubscribeFromAgentTasks(agentId, tenantId) {
    try {
      const key = `${tenantId}:${agentId}`;
      const channel = this.activeSubscriptions.get(key);

      if (channel) {
        await redisClient.unsubscribe(channel);
        this.activeSubscriptions.delete(key);
        console.log(`🔕 Agent ${agentId} unsubscribed from task notifications`);
      }
    } catch (error) {
      console.error('Error unsubscribing from agent tasks:', error);
    }
  }

  /**
   * Broadcast a task to all agents in a tenant (for tenant-wide tasks)
   * @param {object} task - The task object
   * @param {number} tenantId - The tenant ID
   */
  async broadcastTaskToTenant(task, tenantId) {
    try {
      const channel = redisClient.getKey('channel:tenant', 'broadcast', tenantId);
      await redisClient.publish(channel, JSON.stringify({
        type: 'BROADCAST_TASK',
        task,
        timestamp: new Date().toISOString()
      }));

      console.log(`📢 Task ${task.task_id} broadcasted to tenant ${tenantId}`);
      return { success: true };
    } catch (error) {
      console.error('Error broadcasting task:', error);
      throw error;
    }
  }

  /**
   * Clear all tasks for an agent (emergency use)
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   */
  async clearAgentQueue(agentId, tenantId) {
    try {
      const queueKey = redisClient.getKey('queue:agent', agentId, tenantId);
      const processingKey = redisClient.getKey('processing:agent', agentId, tenantId);

      await redisClient.del(queueKey);
      await redisClient.del(processingKey);

      console.log(`🗑️ Queue cleared for agent ${agentId}`);
      return { success: true };
    } catch (error) {
      console.error('Error clearing agent queue:', error);
      throw error;
    }
  }

  /**
   * Get queue statistics for a tenant
   * @param {number} tenantId - The tenant ID
   */
  async getTenantQueueStats(tenantId) {
    try {
      // Scan for all agent queues in this tenant
      const pattern = redisClient.getKey('queue:agent', '*', tenantId);
      const keys = await redisClient.keys(pattern);

      let totalPending = 0;
      const agentStats = [];

      for (const key of keys) {
        const length = await redisClient.lLen(key);
        totalPending += length;

        // Extract agent ID from key
        const agentId = key.split(':').pop();
        agentStats.push({ agentId, pendingTasks: length });
      }

      return {
        tenantId,
        totalPending,
        agentCount: keys.length,
        agentStats
      };
    } catch (error) {
      console.error('Error getting tenant queue stats:', error);
      return { tenantId, totalPending: 0, agentCount: 0, agentStats: [] };
    }
  }
}

module.exports = new TaskQueueService();
