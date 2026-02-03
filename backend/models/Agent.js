// Agent Model
const geoip = require('geoip-lite');

// In-memory storage (will be replaced with DB)
const agents = new Map();

class AgentModel {
  static register(agentData) {
    const agent = {
      id: agentData.id,
      hostname: agentData.hostname,
      os: agentData.os,
      arch: agentData.arch,
      user: agentData.user,
      ip: agentData.ip,
      firstSeen: agentData.firstSeen || new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      status: 'active',
      geo: geoip.lookup(agentData.ip) || null
    };
    
    agents.set(agent.id, agent);
    return agent;
  }
  
  static update(agentId, updates) {
    const agent = agents.get(agentId);
    if (!agent) return null;
    
    Object.assign(agent, updates, { lastSeen: new Date().toISOString() });
    return agent;
  }
  
  static findById(agentId) {
    return agents.get(agentId);
  }
  
  static getAll() {
    return Array.from(agents.values());
  }
  
  static delete(agentId) {
    return agents.delete(agentId);
  }
  
  static getStore() {
    return agents;
  }
}

module.exports = AgentModel;
