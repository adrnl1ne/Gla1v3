const redisClient = require('../utils/redisClient');
const jwt = require('jsonwebtoken');

class TokenBlacklistService {
  /**
   * Blacklist an agent token (revoke access)
   * @param {string} agentId - The agent ID
   * @param {string} token - The JWT token or agent identifier
   * @param {string} reason - Reason for blacklisting
   * @param {number} tenantId - The tenant ID
   * @param {number} ttl - Time to live in seconds (optional, auto-calculated from JWT)
   */
  async blacklistAgentToken(agentId, token, reason, tenantId, ttl = null) {
    try {
      // Calculate TTL from JWT expiration if not provided
      if (!ttl) {
        try {
          const decoded = jwt.decode(token);
          if (decoded && decoded.exp) {
            const now = Math.floor(Date.now() / 1000);
            ttl = decoded.exp - now;
            
            // If token already expired, no need to blacklist
            if (ttl <= 0) {
              console.log(`Token for agent ${agentId} already expired, skipping blacklist`);
              return { success: true, alreadyExpired: true };
            }
          }
        } catch (err) {
          console.error('Error decoding token for TTL:', err);
          // Default to 7 days if we can't decode
          ttl = 7 * 24 * 60 * 60;
        }
      }

      const key = redisClient.getKey('blacklist:agent', agentId, tenantId);
      const metadata = JSON.stringify({
        token: token.substring(0, 20) + '...', // Store only prefix for audit
        reason,
        blacklistedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString()
      });

      await redisClient.set(key, metadata, ttl);

      // Also add to tenant-wide blacklist set for quick lookups
      const setKey = redisClient.getKey('blacklist:set', 'agents', tenantId);
      await redisClient.sAdd(setKey, agentId);

      console.log(`🚫 Agent ${agentId} token blacklisted for ${ttl}s: ${reason}`);

      return { success: true, ttl, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
    } catch (error) {
      console.error('Error blacklisting agent token:', error);
      throw error;
    }
  }

  /**
   * Check if an agent token is blacklisted
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   * @returns {Promise<boolean>}
   */
  async isAgentBlacklisted(agentId, tenantId) {
    try {
      const key = redisClient.getKey('blacklist:agent', agentId, tenantId);
      const exists = await redisClient.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Error checking agent blacklist:', error);
      // Fail open on Redis errors (allow access)
      return false;
    }
  }

  /**
   * Get blacklist metadata for an agent
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   */
  async getBlacklistInfo(agentId, tenantId) {
    try {
      const key = redisClient.getKey('blacklist:agent', agentId, tenantId);
      const metadata = await redisClient.get(key);
      
      if (!metadata) {
        return null;
      }

      const ttl = await redisClient.ttl(key);
      const info = JSON.parse(metadata);
      
      return {
        ...info,
        remainingTTL: ttl
      };
    } catch (error) {
      console.error('Error getting blacklist info:', error);
      return null;
    }
  }

  /**
   * Remove an agent from blacklist (unrevoke)
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   */
  async removeFromBlacklist(agentId, tenantId) {
    try {
      const key = redisClient.getKey('blacklist:agent', agentId, tenantId);
      await redisClient.del(key);

      // Remove from tenant-wide set
      const setKey = redisClient.getKey('blacklist:set', 'agents', tenantId);
      await redisClient.sRem(setKey, agentId);

      console.log(`✅ Agent ${agentId} removed from blacklist`);
      return { success: true };
    } catch (error) {
      console.error('Error removing from blacklist:', error);
      throw error;
    }
  }

  /**
   * Get all blacklisted agents for a tenant
   * @param {number} tenantId - The tenant ID
   */
  async getBlacklistedAgents(tenantId) {
    try {
      const setKey = redisClient.getKey('blacklist:set', 'agents', tenantId);
      const agentIds = await redisClient.sMembers(setKey);

      const blacklistedAgents = [];
      for (const agentId of agentIds) {
        const info = await this.getBlacklistInfo(agentId, tenantId);
        if (info) {
          blacklistedAgents.push({
            agentId,
            ...info
          });
        }
      }

      return blacklistedAgents;
    } catch (error) {
      console.error('Error getting blacklisted agents:', error);
      return [];
    }
  }

  /**
   * Blacklist user session token
   * @param {string} token - The JWT token
   * @param {number} userId - The user ID
   * @param {string} reason - Reason for blacklisting
   */
  async blacklistUserToken(token, userId, reason) {
    try {
      // Decode token to get expiration
      let ttl = 24 * 60 * 60; // Default 24 hours
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.exp) {
          const now = Math.floor(Date.now() / 1000);
          ttl = decoded.exp - now;
          
          if (ttl <= 0) {
            return { success: true, alreadyExpired: true };
          }
        }
      } catch (err) {
        console.error('Error decoding user token:', err);
      }

      // Use token hash or JTI as key if available
      const decoded = jwt.decode(token);
      const tokenId = decoded?.jti || token.substring(0, 32);
      
      const key = redisClient.getKey('blacklist:user', tokenId);
      const metadata = JSON.stringify({
        userId,
        reason,
        blacklistedAt: new Date().toISOString()
      });

      await redisClient.set(key, metadata, ttl);

      console.log(`🚫 User ${userId} token blacklisted: ${reason}`);
      return { success: true, ttl };
    } catch (error) {
      console.error('Error blacklisting user token:', error);
      throw error;
    }
  }

  /**
   * Check if a user token is blacklisted
   * @param {string} token - The JWT token
   */
  async isUserTokenBlacklisted(token) {
    try {
      const decoded = jwt.decode(token);
      const tokenId = decoded?.jti || token.substring(0, 32);
      
      const key = redisClient.getKey('blacklist:user', tokenId);
      const exists = await redisClient.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Error checking user token blacklist:', error);
      return false; // Fail open
    }
  }
}

module.exports = new TokenBlacklistService();
