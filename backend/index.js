const express = require('express');
const fs = require('fs');
const https = require('https');
const path = require('path');
const app = express();
// Separate app for C2 mTLS (HTTPS)
const c2app = express();


// Minimal PEM CN extractor using built-in crypto
const agents = new Map();
const geoip = require('geoip-lite');
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
c2app.use(express.json({ limit: '8kb' }));

// Helper: basic sanitize (strip angle brackets) and truncate
const sanitize = (s, maxLen = 1024) => {
  if (!s) return '';
  let out = String(s).replace(/[<>]/g, '');
  if (out.length > maxLen) out = out.slice(0, maxLen) + '...(truncated)';
  return out;
};

// Fetch Wazuh alert (non-blocking background call). Uses env vars WAZUH_URL, WAZUH_USER, WAZUH_PASS
async function fetchWazuhAlert(agentId, output) {
  try {
    const base = process.env.WAZUH_URL || 'https://wazuh-manager:55000';
    const user = process.env.WAZUH_USER || 'wazuh';
    const pass = process.env.WAZUH_PASS || 'password';
    // Simple search: limit to recent alerts for the agent
    const q = encodeURIComponent(`agent.name:${agentId}`);
    const url = `${base}/alerts?q=${q}&limit=1&sort=-@timestamp`;
    const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

    console.log(`Wazuh fetch: ${url} (agent=${agentId})`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let res;
    try {
      // Create an https.Agent that trusts the local CA (mounted into the container)
      // This lets Node validate the Wazuh manager certificate signed by your internal CA.
      const caPath = path.join(__dirname, 'certs', 'ca.crt');
      let httpsAgent = undefined;
      try {
        const ca = fs.readFileSync(caPath);
        httpsAgent = new https.Agent({ ca, keepAlive: true });
      } catch (e) {
        // If the CA isn't available, continue without a custom agent (will use system CA)
        console.warn('Wazuh fetch: CA file not found or unreadable at', caPath, '-', e && e.message);
      }

      const fetchOpts = { headers: { Authorization: auth, Accept: 'application/json' }, signal: controller.signal };
      if (httpsAgent) fetchOpts.agent = { 'https:': httpsAgent };

      res = await fetch(url, fetchOpts);
    } catch (err) {
      clearTimeout(timeout);
      console.error('Wazuh fetch failed to reach URL:', url, err && (err.stack || err.message || err));
      throw err;
    }
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => '<no-body>');
      console.error('Wazuh fetch non-OK:', res.status, res.statusText, text);
      return null;
    }

    const json = await res.json().catch(async (e) => {
      const text = await res.text().catch(() => '<no-body>');
      console.error('Wazuh response JSON parse error:', e && (e.stack || e.message || e), 'body:', text);
      return null;
    });
    if (!json) return null;

    const items = json?.data?.affected_items || [];
    if (!items.length) return null;
    const it = items[0];
    return {
      description: it?.rule?.description || '',
      rule_id: it?.rule?.id || '',
      timestamp: it['@timestamp'] || ''
    };
  } catch (e) {
    console.error('Wazuh fetch error:', e && (e.stack || e.message || e));
    return null;
  }
}



c2app.post('/beacon', (req, res) => {
  const body = req.body || {};
  const agentID = sanitize(body.agent_id || req.headers['x-agent-id'] || 'unknown', 128);
  const seq = Number(body.seq || 0);
  const output = sanitize(body.output || '', 2048);
  const errStr = sanitize(body.error || '', 1024);

  // Extract CN from mutual TLS if available
  let cn = 'no-cert';
  if (req.socket && req.socket.getPeerCertificate) {
    const peer = req.socket.getPeerCertificate();
    if (peer && peer.subject && peer.subject.CN) cn = peer.subject.CN;
  }

  const now = new Date().toISOString();
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString();
  // Normalize IPv4-mapped IPv6 addresses like ::ffff:192.168.0.1
  const ipNorm = ip.split(',')[0].trim().replace(/^.*:/, '');
  const geo = geoip.lookup(ipNorm);

  let agent = agents.get(agentID) || { id: agentID, cn, ip, firstSeen: now };
  agent.cn = cn;
  agent.ip = ip;
  if (geo && Array.isArray(geo.ll)) {
    agent.lat = geo.ll[0];
    agent.lng = geo.ll[1];
    agent.geo = { country: geo.country, region: geo.region, city: geo.city };
  }
  agent.lastSeen = now;
  agent.beaconCount = (agent.beaconCount || 0) + 1;
  agent.lastAction = `${output}${errStr ? ' | err: ' + errStr : ''} (at ${now})`;
  agent.seq = seq;
  agent.detection = 'pending';
  agents.set(agentID, agent);

  // Background Wazuh check — do not block the response
  (async () => {
    const alert = await fetchWazuhAlert(agentID, output);
    if (alert) {
      agent.detection = `Detected: ${alert.description} (rule ${alert.rule_id})`;
    } else {
      agent.detection = 'No detection';
    }
    agents.set(agentID, agent);
  })();

  res.status(200).send('OK');
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