// EDR Service
const { config } = require('../config/env');

// In-memory storage (will be replaced with DB)
const edrConfigs = new Map();

class EDRService {
  static initialize() {
    // Initialize default Wazuh EDR
    const defaultWazuhConfig = {
      id: 'wazuh-default',
      name: 'Wazuh EDR (OpenSearch)',
      type: 'opensearch',
      url: config.opensearch.url,
      user: config.opensearch.user,
      pass: config.opensearch.pass,
      authMethod: config.opensearch.authMethod,
      endpoints: {
        alerts: '/wazuh-alerts-*/_search',
        query: {
          "size": 500,
          "sort": [{"timestamp": {"order": "desc"}}],
          "query": {"match_all": {}}
        }
      },
      enabled: true,
      createdAt: new Date().toISOString()
    };
    
    edrConfigs.set('wazuh-default', defaultWazuhConfig);
    console.log('[EDR Init] Default Wazuh config:', {
      url: defaultWazuhConfig.url,
      authMethod: defaultWazuhConfig.authMethod
    });
  }
  
  static async fetchAlerts(edrId = null) {
    const configs = edrId 
      ? [edrConfigs.get(edrId)].filter(Boolean)
      : Array.from(edrConfigs.values()).filter(c => c.enabled);
    
    const allAlerts = [];
    
    for (const edr of configs) {
      try {
        const alerts = await this.fetchFromEDR(edr);
        allAlerts.push(...alerts);
      } catch (err) {
        console.error(`[EDR] Failed to fetch from ${edr.name}:`, err.message);
      }
    }
    
    return allAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }
  
  static async fetchFromEDR(edr) {
    const https = require('https');
    const http = require('http');
    
    const url = new URL(edr.url + edr.endpoints.alerts);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (edr.authMethod === 'basic' && edr.user) {
      const auth = Buffer.from(`${edr.user}:${edr.pass}`).toString('base64');
      options.headers['Authorization'] = `Basic ${auth}`;
    }
    
    return new Promise((resolve, reject) => {
      const req = client.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const alerts = this.parseOpenSearchResponse(parsed, edr);
            resolve(alerts);
          } catch (err) {
            reject(new Error(`Parse error: ${err.message}`));
          }
        });
      });
      
      req.on('error', reject);
      req.write(JSON.stringify(edr.endpoints.query));
      req.end();
    });
  }
  
  static parseOpenSearchResponse(response, edr) {
    const hits = response.hits?.hits || [];
    
    return hits.map(hit => {
      const doc = hit._source;
      const rule = doc.rule || {};
      const agent = doc.agent || {};
      
      return {
        id: hit._id,
        timestamp: doc.timestamp || doc['@timestamp'],
        edrId: edr.id,
        edrName: edr.name,
        agent: agent.name || 'unknown',
        level: rule.level || 0,
        description: rule.description || 'No description',
        mitre: rule.mitre || { tactics: [], techniques: [] }
      };
    });
  }
  
  static getAllConfigs() {
    return Array.from(edrConfigs.values()).map(edr => ({
      ...edr,
      pass: edr.pass ? '***' : ''
    }));
  }
  
  static getConfig(id) {
    return edrConfigs.get(id);
  }
  
  static createConfig(data) {
    const crypto = require('crypto');
    const id = `edr-${crypto.randomBytes(8).toString('hex')}`;
    
    const config = {
      id,
      name: data.name,
      type: data.type,
      url: data.url,
      user: data.user || '',
      pass: data.pass || '',
      authMethod: data.authMethod || 'none',
      enabled: data.enabled !== false,
      endpoints: data.endpoints || {},
      createdAt: new Date().toISOString()
    };
    
    edrConfigs.set(id, config);
    return config;
  }
  
  static updateConfig(id, updates) {
    const edr = edrConfigs.get(id);
    if (!edr) return null;
    
    Object.assign(edr, {
      name: updates.name || edr.name,
      type: updates.type || edr.type,
      url: updates.url || edr.url,
      user: updates.user !== undefined ? updates.user : edr.user,
      pass: updates.pass || edr.pass,
      authMethod: updates.authMethod || edr.authMethod,
      enabled: updates.enabled !== undefined ? updates.enabled : edr.enabled,
      endpoints: updates.endpoints || edr.endpoints
    });
    
    return edr;
  }
  
  static deleteConfig(id) {
    return edrConfigs.delete(id);
  }
}

module.exports = EDRService;
