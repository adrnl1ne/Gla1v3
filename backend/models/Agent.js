// Agent Model
const geoip = require('geoip-lite');

// In-memory storage (will be replaced with DB)
const agents = new Map();

class AgentModel {
  static register(agentData) {
    const ip = agentData.ip || 'unknown';
    const geoResult = ip !== 'unknown' ? geoip.lookup(ip) : null;
    
    const agent = {
      id: agentData.id,
      cn: agentData.cn || 'unknown',
      hostname: agentData.hostname,
      os: agentData.os,
      arch: agentData.arch,
      user: agentData.user,
      ip: ip,
      firstSeen: agentData.firstSeen || new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      lastAction: new Date().toISOString(),
      status: 'active',
      geo: null
    };
    
    // Set geo data if available
    if (geoResult && Array.isArray(geoResult.ll)) {
      agent.lat = geoResult.ll[0];
      agent.lng = geoResult.ll[1];
      agent.geo = {
        country: geoResult.country,
        region: geoResult.region,
        city: geoResult.city
      };
    }
    
    agents.set(agent.id, agent);
    console.log(`[AGENT] Registered: ${agent.id} | CN: ${agent.cn} | IP: ${agent.ip} | GEO: ${agent.geo ? `${agent.geo.city}, ${agent.geo.country}` : 'N/A'} | Lat/Lng: ${agent.lat || 'N/A'}/${agent.lng || 'N/A'}`);
    return agent;
  }
  
  static update(agentId, updates) {
    const agent = agents.get(agentId);
    if (!agent) return null;
    
    const now = new Date().toISOString();
    
    // Check if IP is being updated
    const ipChanged = updates.ip && updates.ip !== agent.ip;
    
    // Apply updates
    Object.assign(agent, updates, { 
      lastSeen: now,
      lastAction: now
    });
    
    // Update geo if IP changed
    if (ipChanged) {
      const geoResult = geoip.lookup(agent.ip);
      if (geoResult && Array.isArray(geoResult.ll)) {
        agent.lat = geoResult.ll[0];
        agent.lng = geoResult.ll[1];
        agent.geo = {
          country: geoResult.country,
          region: geoResult.region,
          city: geoResult.city
        };
      } else {
        agent.lat = null;
        agent.lng = null;
        agent.geo = null;
      }
    }
    
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
