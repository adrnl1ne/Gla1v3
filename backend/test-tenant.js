const {query} = require('./db/connection');

async function test() {
  try {
    console.log('Testing tenant lookup...');
    const result = await query('SELECT * FROM tenants WHERE api_key = $1', ['default-tenant-key']);
    console.log('Query result:', result.rows);
    console.log('Row count:', result.rows.length);
    
    const result2 = await query("SELECT * FROM tenants WHERE name = 'Default'");
    console.log('Default tenant:', result2.rows);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

test();
