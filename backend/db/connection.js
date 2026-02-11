// PostgreSQL Database Connection Pool
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');

// Request-scoped storage for database client (for RLS context)
const requestContext = new AsyncLocalStorage();

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
// This automatically uses the request-scoped client if available (for RLS)
async function query(text, params) {
  const start = Date.now();
  const contextClient = requestContext.getStore();
  
  try {
    // Use request-scoped client if available, otherwise use pool
    const client = contextClient || pool;
    const res = await client.query(text, params);
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
  return await pool.connect();
}

// Set current user context for Row-Level Security
async function setCurrentUser(userId) {
  try {
    await pool.query("SELECT set_config('app.current_user_id', $1, false)", [userId]);
  } catch (error) {
    console.error('[DB] Failed to set current user context:', error.message);
    throw error;
  }
}

// Execute a query with RLS context
async function queryWithContext(userId, text, params) {
  const client = await pool.connect();
  try {
    // Set user context for this connection
    await client.query("SELECT set_config('app.current_user_id', $1, false)", [userId]);
    // Execute the actual query
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// Run a function with request-scoped database client and RLS context
async function withRLSContext(userId, fn) {
  const client = await pool.connect();
  try {
    // Set RLS context
    await client.query("SELECT set_config('app.current_user_id', $1, false)", [userId]);
    
    // Run the function with this client in context
    return await requestContext.run(client, fn);
  } finally {
    client.release();
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
  queryWithContext,
  withRLSContext,
  requestContext,
};
