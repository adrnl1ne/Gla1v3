const express = require('express');
const app = express();

// In-memory agent store (Move to DB later)
const agents = new Map();

app.use(express.json());

// Log every request
app.use((req, res, next) => {
  console.log(`\nINCOMING → ${req.method} ${req.url} on port ${req.socket.localPort}`);
  console.log('HEADERS:', req.headers);
  next();
});

app.get('/health', (req, res) => res.send('OK'));

app.get('/beacon', (req, res) => {
  const agentID = req.headers['x-agent-id'] || 'unknown';

  // Traefik v2.10 uses THIS header (not x-client-certificate)
  const clientCertPEM = req.headers['ssl-client-cert'] || req.headers['x-client-cert'];

  let cn = 'no-cert';
  if (clientCertPEM) {
    try {
      const match = clientCertPEM.match(/CN=([^\/\n,]+)/);
      cn = match ? match[1] : 'unknown';
    } catch (e) {
      cn = 'parse-error';
    }
  }
  console.log(`BEACON SUCCESS → ID: ${agentID} | CN: ${cn}`);
  res.send('Gla1v3 C2 alive');
});


// Create or Update Agent
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

// Dashboard endpoint
app.get('/api/agents', (req, res) => {
  res.json(Array.from(agents.values()));
});


app.listen(3000, '0.0.0.0', () => console.log('API ready on :3000'));
app.listen(3001, '0.0.0.0', () => console.log('C2 mTLS ready on :3001'));