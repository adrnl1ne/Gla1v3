// Agent Service
const AgentModel = require('../models/Agent');
const { config } = require('../config/env');

class AgentService {
  static handleBeacon(agentData, clientCert) {
    const agentId = agentData.id || this.extractCNFromCert(clientCert);
    
    let agent = AgentModel.findById(agentId);
    
    if (!agent) {
      agent = AgentModel.register({
        id: agentId,
        hostname: agentData.hostname,
        os: agentData.os,
        arch: agentData.arch,
        user: agentData.user,
        ip: agentData.ip
      });
    } else {
      AgentModel.update(agentId, {
        hostname: agentData.hostname,
        os: agentData.os,
        arch: agentData.arch,
        user: agentData.user,
        ip: agentData.ip
      });
    }
    
    return agent;
  }
  
  static getAllAgents() {
    return AgentModel.getAll();
  }
  
  static getAgent(agentId) {
    return AgentModel.findById(agentId);
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
