const express = require('express');
const app = express();

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
      cn = match ? match[1] : 'cert-present-no-cn';
    } catch (e) {
      cn = 'parse-error';
    }
  }

  console.log(`BEACON SUCCESS → ID: ${agentID} | CN: ${cn}`);
  res.send('Gla1v3 C2 alive');
});

app.listen(3000, '0.0.0.0', () => console.log('API ready on :3000'));
app.listen(3001, '0.0.0.0', () => console.log('C2 mTLS ready on :3001'));