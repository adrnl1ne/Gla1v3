// Environment Configuration and Validation
const crypto = require('crypto');

const REQUIRED_SECRETS = [
  'JWT_SECRET',
  'ADMIN_PASSWORD',
  'INTERNAL_TOKEN',
  'AGENT_WHOAMI_TOKEN'
];

const INSECURE_VALUES = [
  'CHANGEME',
  'admin',
  'password',
  'secret',
  'test',
  '12345'
];

function validateSecrets() {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowInsecure = process.env.ALLOW_INSECURE_DEFAULTS === 'true';
  
  if (!isProduction && allowInsecure) {
    console.warn('⚠️  INSECURE MODE: Running with relaxed secret validation (development only)');
    return;
  }
  
  const errors = [];
  
  for (const secretName of REQUIRED_SECRETS) {
    const value = process.env[secretName];
    
    if (!value || value.trim() === '') {
      errors.push(`❌ ${secretName} is not set`);
      continue;
    }
    
    const lowerValue = value.toLowerCase();
    for (const insecureWord of INSECURE_VALUES) {
      if (lowerValue.includes(insecureWord)) {
        errors.push(`❌ ${secretName} contains insecure value: "${insecureWord}"`);
        break;
      }
    }
    
    if (value.length < 16) {
      errors.push(`❌ ${secretName} is too short (min 16 characters, got ${value.length})`);
    }
  }
  
  if (errors.length > 0) {
    console.error('\n╔════════════════════════════════════════════════════════════════╗');
    console.error('║   FATAL: INSECURE OR MISSING SECRETS DETECTED                  ║');
    console.error('╚════════════════════════════════════════════════════════════════╝\n');
    
    errors.forEach(err => console.error(err));
    
    console.error('\n📋 HOW TO FIX:');
    console.error('  1. Check your root .env file (repo root)');
    console.error('  2. Ensure all secrets are set with strong values');
    console.error('  3. Restart the application\n');
    console.error('For development only: Set ALLOW_INSECURE_DEFAULTS=true (NOT for production!)\n');
    
    process.exit(1);
  }
  
  console.log('✅ All required secrets validated successfully');
}

const config = {
  env: process.env.NODE_ENV || 'development',
  domain: process.env.GLA1V3_DOMAIN || 'gla1v3.local',
  
  // Security
  jwtSecret: process.env.JWT_SECRET,
  adminPassword: process.env.ADMIN_PASSWORD,
  internalToken: process.env.INTERNAL_TOKEN,
  agentWhoamiToken: process.env.AGENT_WHOAMI_TOKEN,
  saltRounds: 10,

  // Certificates
  certDir: process.env.CERT_DIR || '/certs',

  // Feature flags
  enableEmbeddedCertRevocation: (process.env.ENABLE_EMBEDDED_CERT_REVOCATION === 'true')
};

module.exports = {
  config,
  validateSecrets
};
