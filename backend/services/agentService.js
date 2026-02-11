// Agent Service
const AgentModel = require('../models/Agent');
const TenantModel = require('../models/Tenant');
const CAClient = require('../utils/caClient');
const { config } = require('../config/env');

class AgentService {
  static async handleBeacon(agentData, clientCert, tenantId = null) {
    const agentId = agentData.id || this.extractCNFromCert(clientCert);
    const cn = agentData.cn || this.extractCNFromCert(clientCert);
    
    // Look up agent by CN (certificate common name) instead of agent-provided ID
    let agent = await AgentModel.findByCN(cn, tenantId);
    
    if (!agent) {
      // If no tenant specified, use default tenant
      if (!tenantId) {
        const defaultTenant = await TenantModel.getDefault();
        tenantId = defaultTenant ? defaultTenant.id : null;
      }
      
      if (!tenantId) {
        throw new Error('No tenant available for agent registration');
      }
      
      // Generate certificate from CA service for this agent
      let certId = null;
      try {
        const certData = await CAClient.generateCertificate(agentId, agentId, 3600);
        certId = certData.certId;
        console.log(`[AGENT] Generated dynamic certificate: ${certId}`);
      } catch (err) {
        console.warn(`[AGENT] Failed to generate certificate from CA: ${err.message}`);
        // Continue without cert_id - fallback to static embedded cert
      }
      
      agent = await AgentModel.register({
        cn: cn,
        hostname: agentData.hostname,
        os: agentData.os,
        arch: agentData.arch,
        user: agentData.user,
        ip: agentData.ip,
        cert_id: certId
      }, tenantId);
    } else {
      agent = await AgentModel.update(agent.id, {
        cn: cn,
        hostname: agentData.hostname,
        os: agentData.os,
        arch: agentData.arch,
        username: agentData.user,
        ip_address: agentData.ip
      });
    }
    
    return agent;
  }
  
  static async getAllAgents(tenantId = null) {
    return await AgentModel.getAll(tenantId);
  }
  
  static async getAgent(agentId) {
    return await AgentModel.findById(agentId);
  }
  
  static extractCNFromCert(pem) {
    try {
      const asn1 = require('asn1.js');
      const b64 = pem.replace(/-----BEGIN CERTIFICATE-----/g, '')
                    .replace(/-----END CERTIFICATE-----/g, '')
                    .replace(/[\r\n\s]/g, '');
      const der = Buffer.from(b64, 'base64');
      
      const Certificate = asn1.define('Certificate', function() {
        this.seq().obj(
          this.key('tbsCertificate').seq().obj(
            this.key('version').explicit(0).int(),
            this.key('serialNumber').int(),
            this.key('signature').seq().obj(),
            this.key('issuer').seq().obj(),
            this.key('validity').seq().obj(),
            this.key('subject').seqof(asn1.define('RDN', function() {
              this.setof(asn1.define('AttributeTypeAndValue', function() {
                this.seq().obj(
                  this.key('type').objid(),
                  this.key('value').any()
                );
              }));
            })),
          ),
          this.key('signatureAlgorithm').seq().obj(),
          this.key('signatureValue').bitstr()
        );
      });
      
      const cert = Certificate.decode(der, 'der');
      
      for (const rdn of cert.tbsCertificate.subject) {
        for (const attr of rdn) {
          if (attr.type.join('.') === '2.5.4.3') {
            return attr.value.toString();
          }
        }
      }
      return 'unknown';
    } catch (e) {
      return 'parse-error';
    }
  }
}

module.exports = AgentService;
