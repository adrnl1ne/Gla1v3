// Database Connection Test Script
// Run this to verify PostgreSQL integration is working
// Usage: node test-db-connection.js

const { query } = require('./connection');

async function testConnection() {
  console.log('🔍 Testing PostgreSQL connection...\n');
  
  try {
    // Test 1: Basic connection
    console.log('[1/6] Testing basic connection...');
    const timeResult = await query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Connected to PostgreSQL');
    console.log(`   Time: ${timeResult.rows[0].current_time}`);
    console.log(`   Version: ${timeResult.rows[0].pg_version.split(',')[0]}\n`);
    
    // Test 2: Check tables exist
    console.log('[2/6] Checking schema tables...');
    const tablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log(`✅ Found ${tablesResult.rowCount} tables:`);
    tablesResult.rows.forEach(row => console.log(`   - ${row.table_name}`));
    console.log('');
    
    // Test 3: Check default tenant
    console.log('[3/6] Checking default tenant...');
    const tenantResult = await query(`SELECT * FROM tenants WHERE name = 'Default'`);
    if (tenantResult.rowCount > 0) {
      console.log('✅ Default tenant exists');
      console.log(`   ID: ${tenantResult.rows[0].id}`);
      console.log(`   Name: ${tenantResult.rows[0].name}`);
      console.log(`   Active: ${tenantResult.rows[0].active}\n`);
    } else {
      console.log('⚠️  Default tenant not found\n');
    }
    
    // Test 4: Check users
    console.log('[4/6] Checking users...');
    const usersResult = await query('SELECT id, username, role FROM users');
    console.log(`✅ Found ${usersResult.rowCount} user(s):`);
    usersResult.rows.forEach(row => {
      console.log(`   - ${row.username} (${row.role}) [${row.id}]`);
    });
    console.log('');
    
    // Test 5: Check RLS is enabled
    console.log('[5/6] Checking Row-Level Security...');
    const rlsResult = await query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND rowsecurity = true
      ORDER BY tablename
    `);
    console.log(`✅ RLS enabled on ${rlsResult.rowCount} table(s):`);
    rlsResult.rows.forEach(row => console.log(`   - ${row.tablename}`));
    console.log('');
    
    // Test 6: Check helper functions
    console.log('[6/6] Checking helper functions...');
    const functionsResult = await query(`
      SELECT proname 
      FROM pg_proc 
      WHERE pronamespace = 'public'::regnamespace
      ORDER BY proname
    `);
    console.log(`✅ Found ${functionsResult.rowCount} helper function(s):`);
    functionsResult.rows.forEach(row => console.log(`   - ${row.proname}()`));
    console.log('');
    
    console.log('═══════════════════════════════════════');
    console.log('✅ All database tests passed!');
    console.log('═══════════════════════════════════════');
    
  } catch (error) {
    console.error('❌ Database test failed:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Code: ${error.code}`);
    process.exit(1);
  }
  
  process.exit(0);
}

testConnection();
