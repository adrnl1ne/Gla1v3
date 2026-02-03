// CORS Configuration
const { config } = require('./env');

function setupCORS(app) {
  app.use((req, res, next) => {
    const domain = config.domain;
    const allowed = [`https://dashboard.${domain}`, `https://${domain}`];
    const origin = req.headers.origin;
    
    if (origin && allowed.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      res.header('Access-Control-Allow-Origin', allowed[0]);
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Agent-ID, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });
}

module.exports = { setupCORS };
