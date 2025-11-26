const express = require('express');
const fs = require('fs');
const https = require('https');
const path = require('path');
const app = express();
// Separate app for C2 mTLS (HTTPS)
const c2app = express();


// Minimal PEM CN extractor using built-in crypto
const agents = new Map();
const extractCN = (pem) => {
  try {
    // Remove header/footer and newlines
    const b64 = pem.replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/-----END CERTIFICATE-----/g, '').replace(/[\r\n\s]/g, '');
    const der = Buffer.from(b64, 'base64');
    const asn1 = require('asn1.js');
    // ASN.1 X.509 Certificate parser (minimal, just for subject)
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
    // OID for CN is 2.5.4.3
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
};


// Manual CORS middleware — FINAL WORKING VERSION
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://dashboard.gla1v3.local");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Agent-ID");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Log every request
app.use((req, res, next) => {
  console.log(`\nINCOMING → ${req.method} ${req.url} on port ${req.socket.localPort}`);
  console.log('HEADERS:', req.headers);
  next();
});

app.get('/health', (req, res) => res.send('OK'));


// Only /beacon route on c2app (mTLS)
c2app.use(express.json());
c2app.get('/beacon', (req, res) => {
  const agentID = req.headers['x-agent-id'] || 'unknown';
  let cn = 'no-cert';
  if (req.socket.getPeerCertificate) {
    const peerCert = req.socket.getPeerCertificate();
    if (peerCert && peerCert.subject && peerCert.subject.CN) {
      cn = peerCert.subject.CN;
    } else if (peerCert && peerCert.raw) {
      try {
        cn = extractCN(peerCert.raw.toString('base64'));
      } catch (e) {
        cn = 'parse-error';
      }
    }
  }
  console.log(`BEACON SUCCESS → ID: ${agentID} | CN: ${cn}`);
  const now = new Date().toISOString();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  agents.set(agentID, {
    id: agentID,
    cn,
    ip,
    firstSeen: agents.has(agentID) ? agents.get(agentID).firstSeen : now,
    lastSeen: now,
    beaconCount: (agents.get(agentID)?.beaconCount || 0) + 1
  });
  res.send('Gla1v3 C2 alive');
});

// Dashboard endpoint
app.get('/api/agents', (req, res) => {
  res.json(Array.from(agents.values()));
});



// Start HTTP server for dashboard/API
app.listen(3000, '0.0.0.0', () => console.log('API ready on :3000'));

// mTLS HTTPS server for C2 beacon (only /beacon route)
const c2Cert = fs.readFileSync(path.join(__dirname, 'certs/c2.gla1v3.local.crt'));
const c2Key = fs.readFileSync(path.join(__dirname, 'certs/c2.gla1v3.local.key'));
const caCert = fs.readFileSync(path.join(__dirname, 'certs/ca.crt'));

https.createServer({
  key: c2Key,
  cert: c2Cert,
  ca: caCert,
  requestCert: true,
  rejectUnauthorized: true
}, c2app).listen(3001, '0.0.0.0', () => {
  console.log('C2 mTLS server ready on :3001');
});