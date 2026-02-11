// PostgreSQL Database Connection Pool
const { Pool } = require('pg');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'gla1v3',
  user: process.env.DB_USER || 'gla1v3_app',
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Validate required configuration
if (!config.password) {
  console.error('❌ DB_PASSWORD environment variable is not set!');
  process.exit(1);
}

// Create connection pool
const pool = new Pool(config);

// Handle pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle database client', err);
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Failed to connect to database:', err.message);
    console.error('   Host:', config.host);
    console.error('   Port:', config.port);
    console.error('   Database:', config.database);
    console.error('   User:', config.user);
    process.exit(1);
  }
  console.log('✅ Database connected successfully');
  console.log(`   PostgreSQL Time: ${res.rows[0].now}`);
});

// Helper function to execute queries with error handling
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 100));
    }
    
    return res;
  } catch (error) {
    console.error('[DB] Query error:', error.message);
    console.error('[DB] Query:', text);
    console.error('[DB] Params:', params);
    throw error;
  }
}

// Helper function to get a client from pool for transactions
async function getClient() {
  return await pool.query();
}

// Set current user context for Row-Level Security
async function setCurrentUser(userId) {
  try {
    await pool.query('SELECT set_current_user($1)', [userId]);
  } catch (error) {
    console.error('[DB] Failed to set current user context:', error.message);
    throw error;
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Closing database pool...');
  await pool.end();
  console.log('Database pool closed');
});

module.exports = {
  pool,
  query,
  getClient,
  setCurrentUser,
};
