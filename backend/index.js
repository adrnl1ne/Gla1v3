const express = require('express');
const app = express();
const http = require('http');


// Allow Traefik to perform health checks
app.get('/health', (req, res) => res.send('OK'));

// Ping Endpoint
app.get('/beacon', (req, res) => {
    const agentID = req.headers['x-agent-id'] || 'unknown';
    const cert = req.socket.getPeerCertificate();
    const clientCN = cert && cert.subject ? cert.subject.CN : 'unknown';
    console.log(`AGENT BEACON -> ID: ${agentID} | Cert CN: ${clientCN}`);
    res.send('Gla1v3 C2 alive');
});

// Start two Listener servers
    const server3000 = http.createServer(app);
    const server3001 = http.createServer(app);


server3000.listen(3000, '0.0.0.0', () => {
    console.log(`API Server listening on : 3000`);
});

server3001.listen(3001, '0.0.0.0', () => {
    console.log(`Gla1v3 C2 Server listener ready on : 3001 (mTLS)`);
});