const redisClient = require('../utils/redisClient');

class CacheService {
  constructor() {
    // Default TTL values (in seconds)
    this.TTL = {
      AGENT: 300,        // 5 minutes
      TENANT: 3600,      // 1 hour
      SESSION: 86400,    // 24 hours
      USER: 1800,        // 30 minutes
      TASK: 600          // 10 minutes
    };
  }

  // ==================== AGENT CACHING ====================

  /**
   * Cache agent data
   * @param {string} agentId - The agent ID
   * @param {object} agentData - The agent object
   * @param {number} tenantId - The tenant ID
   */
  async cacheAgent(agentId, agentData, tenantId) {
    try {
      const key = redisClient.getKey('cache:agent', agentId, tenantId);
      await redisClient.set(key, JSON.stringify(agentData), this.TTL.AGENT);
      return true;
    } catch (error) {
      console.error('Error caching agent:', error);
      return false;
    }
  }

  /**
   * Get cached agent data
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   */
  async getAgent(agentId, tenantId) {
    try {
      const key = redisClient.getKey('cache:agent', agentId, tenantId);
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached agent:', error);
      return null;
    }
  }

  /**
   * Invalidate agent cache
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   */
  async invalidateAgent(agentId, tenantId) {
    try {
      const key = redisClient.getKey('cache:agent', agentId, tenantId);
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Error invalidating agent cache:', error);
      return false;
    }
  }

  /**
   * Cache agent status (lightweight, updated frequently)
   * @param {string} agentId - The agent ID
   * @param {object} status - Status object {lastSeen, status, ip}
   * @param {number} tenantId - The tenant ID
   */
  async cacheAgentStatus(agentId, status, tenantId) {
    try {
      const key = redisClient.getKey('cache:agent:status', agentId, tenantId);
      await redisClient.set(key, JSON.stringify(status), 60); // 1 minute TTL
      return true;
    } catch (error) {
      console.error('Error caching agent status:', error);
      return false;
    }
  }

  /**
   * Get cached agent status
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   */
  async getAgentStatus(agentId, tenantId) {
    try {
      const key = redisClient.getKey('cache:agent:status', agentId, tenantId);
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached agent status:', error);
      return null;
    }
  }

  // ==================== TENANT CACHING ====================

  /**
   * Cache tenant data
   * @param {number} tenantId - The tenant ID
   * @param {object} tenantData - The tenant object
   */
  async cacheTenant(tenantId, tenantData) {
    try {
      const key = redisClient.getKey('cache:tenant', tenantId);
      await redisClient.set(key, JSON.stringify(tenantData), this.TTL.TENANT);
      return true;
    } catch (error) {
      console.error('Error caching tenant:', error);
      return false;
    }
  }

  /**
   * Get cached tenant data
   * @param {number} tenantId - The tenant ID
   */
  async getTenant(tenantId) {
    try {
      const key = redisClient.getKey('cache:tenant', tenantId);
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached tenant:', error);
      return null;
    }
  }

  /**
   * Invalidate tenant cache
   * @param {number} tenantId - The tenant ID
   */
  async invalidateTenant(tenantId) {
    try {
      const key = redisClient.getKey('cache:tenant', tenantId);
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Error invalidating tenant cache:', error);
      return false;
    }
  }

  /**
   * Cache tenant API key mapping (for fast validation)
   * @param {string} apiKey - The API key
   * @param {number} tenantId - The tenant ID
   */
  async cacheTenantApiKey(apiKey, tenantId) {
    try {
      const key = redisClient.getKey('cache:apikey', apiKey);
      await redisClient.set(key, tenantId.toString(), this.TTL.TENANT);
      return true;
    } catch (error) {
      console.error('Error caching tenant API key:', error);
      return false;
    }
  }

  /**
   * Get tenant ID by API key
   * @param {string} apiKey - The API key
   */
  async getTenantByApiKey(apiKey) {
    try {
      const key = redisClient.getKey('cache:apikey', apiKey);
      const tenantId = await redisClient.get(key);
      return tenantId ? parseInt(tenantId) : null;
    } catch (error) {
      console.error('Error getting tenant by API key:', error);
      return null;
    }
  }

  // ==================== SESSION CACHING ====================

  /**
   * Store user session
   * @param {string} sessionId - The session ID (can be JWT token or session token)
   * @param {object} sessionData - Session data {userId, username, role}
   */
  async storeSession(sessionId, sessionData) {
    try {
      const key = redisClient.getKey('session', sessionId);
      await redisClient.set(key, JSON.stringify(sessionData), this.TTL.SESSION);
      return true;
    } catch (error) {
      console.error('Error storing session:', error);
      return false;
    }
  }

  /**
   * Get user session
   * @param {string} sessionId - The session ID
   */
  async getSession(sessionId) {
    try {
      const key = redisClient.getKey('session', sessionId);
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  /**
   * Delete user session (logout)
   * @param {string} sessionId - The session ID
   */
  async deleteSession(sessionId) {
    try {
      const key = redisClient.getKey('session', sessionId);
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      return false;
    }
  }

  /**
   * Refresh session TTL (keep alive)
   * @param {string} sessionId - The session ID
   */
  async refreshSession(sessionId) {
    try {
      const key = redisClient.getKey('session', sessionId);
      await redisClient.expire(key, this.TTL.SESSION);
      return true;
    } catch (error) {
      console.error('Error refreshing session:', error);
      return false;
    }
  }

  // ==================== USER CACHING ====================

  /**
   * Cache user data
   * @param {number} userId - The user ID
   * @param {object} userData - The user object (without password)
   */
  async cacheUser(userId, userData) {
    try {
      const key = redisClient.getKey('cache:user', userId);
      await redisClient.set(key, JSON.stringify(userData), this.TTL.USER);
      return true;
    } catch (error) {
      console.error('Error caching user:', error);
      return false;
    }
  }

  /**
   * Get cached user data
   * @param {number} userId - The user ID
   */
  async getUser(userId) {
    try {
      const key = redisClient.getKey('cache:user', userId);
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached user:', error);
      return null;
    }
  }

  /**
   * Invalidate user cache
   * @param {number} userId - The user ID
   */
  async invalidateUser(userId) {
    try {
      const key = redisClient.getKey('cache:user', userId);
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Error invalidating user cache:', error);
      return false;
    }
  }

  // ==================== TASK CACHING ====================

  /**
   * Cache task result temporarily (before DB write)
   * @param {string} taskId - The task ID
   * @param {object} result - The task result
   * @param {number} tenantId - The tenant ID
   */
  async cacheTaskResult(taskId, result, tenantId) {
    try {
      const key = redisClient.getKey('cache:task:result', taskId, tenantId);
      await redisClient.set(key, JSON.stringify(result), this.TTL.TASK);
      return true;
    } catch (error) {
      console.error('Error caching task result:', error);
      return false;
    }
  }

  /**
   * Get cached task result
   * @param {string} taskId - The task ID
   * @param {number} tenantId - The tenant ID
   */
  async getTaskResult(taskId, tenantId) {
    try {
      const key = redisClient.getKey('cache:task:result', taskId, tenantId);
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached task result:', error);
      return null;
    }
  }

  // ==================== GENERAL CACHE OPERATIONS ====================

  /**
   * Flush all cache for a tenant
   * @param {number} tenantId - The tenant ID
   */
  async flushTenantCache(tenantId) {
    try {
      const pattern = `tenant:${tenantId}:cache:*`;
      const keys = await redisClient.keys(pattern);
      
      if (keys.length > 0) {
        for (const key of keys) {
          await redisClient.del(key);
        }
      }

      console.log(`🗑️ Flushed ${keys.length} cache entries for tenant ${tenantId}`);
      return keys.length;
    } catch (error) {
      console.error('Error flushing tenant cache:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      const patterns = {
        agents: 'cache:agent:*',
        tenants: 'cache:tenant:*',
        sessions: 'session:*',
        users: 'cache:user:*',
        tasks: 'cache:task:*'
      };

      const stats = {};
      for (const [category, pattern] of Object.entries(patterns)) {
        const keys = await redisClient.keys(pattern);
        stats[category] = keys.length;
      }

      return stats;
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return {};
    }
  }
}

module.exports = new CacheService();
