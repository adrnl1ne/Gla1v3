// GLA1V3 Backend - Refactored Modular Architecture
const express = require('express');
const fs = require('fs');
const https = require('https');
const path = require('path');

// Configuration
const { config, validateSecrets } = require('./config/env');
const { setupCORS } = require('./config/cors');

// Middleware
const { requestLogger } = require('./middleware/logger');
const { authenticateJWT } = require('./middleware/auth');

// Services
const AuthService = require('./services/authService');
const EDRService = require('./services/edrService');
const WazuhIndexer = require('./utils/wazuhIndexer');

// Routes
const authRoutes = require('./routes/auth');
const agentRoutes = require('./routes/agents');
const taskRoutes = require('./routes/tasks');
const edrRoutes = require('./routes/edr');
const buildRoutes = require('./routes/build');

// Validate environment secrets
validateSecrets();

// Initialize services
(async () => {
  await AuthService.initializeDefaultAdmin();
  EDRService.initialize();
  WazuhIndexer.startIndexer();
})();

// Express apps
const app = express();
const c2app = express();

// Middleware
app.use(express.json());
c2app.use(express.json());

setupCORS(app);
app.use(requestLogger);
c2app.use(requestLogger);

// Health check
app.get('/health', (req, res) => res.send('OK'));

// Download compiled agent binary (with authentication)
app.get('/api/agents/download/:filename', authenticateJWT, (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join('/app/builds', filename);
  
  // Security: prevent path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    console.log('[DOWNLOAD] Path traversal attempt blocked:', filename);
    return res.status(400).json({ error: 'Invalid filename' });
  }
  
  if (!fs.existsSync(filepath)) {
    console.log('[DOWNLOAD] File not found:', filepath);
    return res.status(404).json({ error: 'Agent binary not found' });
  }
  
  console.log(`[DOWNLOAD] Serving agent binary: ${filename} to user: ${req.user.userId}`);
  
  res.download(filepath, filename, (err) => {
    if (err) {
      console.error(`[DOWNLOAD] Error sending file:`, err.message);
    } else {
      console.log(`[DOWNLOAD] Successfully sent: ${filename}`);
      // Optional: Delete file after successful download (after 60 seconds)
      setTimeout(() => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
          console.log(`[DOWNLOAD] Cleaned up binary: ${filename}`);
        }
      }, 60000);
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api', edrRoutes); // /api/alerts/*, /api/edr-configs/*
app.use('/api/build', buildRoutes);

// C2 Routes (mTLS) - Mount agent beacon route
c2app.use('/', agentRoutes);

// Start servers
const PORT = 3000;
const C2_PORT = 3001;

app.listen(PORT, () => {
  console.log(`✅ Backend API running on port ${PORT}`);
  console.log(`   Environment: ${config.env}`);
  console.log(`   Domain: ${config.domain}`);
});

// C2 Server (plain HTTP - Traefik handles mTLS termination)
c2app.listen(C2_PORT, () => {
  console.log(`✅ C2 server running on port ${C2_PORT} (Traefik handles mTLS)`);
});

module.exports = { app, c2app };
