-- Multi-Tenant Data Isolation Test
-- Verifies Row-Level Security policies work correctly

\echo '========================================='
\echo 'Multi-Tenant Isolation Test'
\echo '========================================='
\echo ''

-- Cleanup previous test data
DELETE FROM tasks WHERE id IN ('t0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000002');
DELETE FROM agents WHERE id LIKE 'a0000000%' OR id LIKE 'b0000000%';
DELETE FROM user_tenants WHERE user_id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
DELETE FROM users WHERE id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
DELETE FROM tenants WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- Setup: Create test data
\echo '1. Creating test tenants...'
INSERT INTO tenants (id, name, api_key) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Tenant A', 'key_tenant_a'),
    ('22222222-2222-2222-2222-222222222222', 'Tenant B', 'key_tenant_b');

\echo '2. Creating test users...'
INSERT INTO users (id, username, password_hash, role) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'operator_a', '$2b$10$test', 'operator'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'operator_b', '$2b$10$test', 'operator'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'admin_user', '$2b$10$test', 'admin');

\echo '3. Assigning operators to tenants...'
INSERT INTO user_tenants (user_id, tenant_id) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'), -- operator_a -> Tenant A
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222'); -- operator_b -> Tenant B

\echo '4. Creating test agents...'
INSERT INTO agents (id, tenant_id, hostname, os) VALUES
    ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'agent-a1', 'Linux'),
    ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'agent-a2', 'Windows'),
    ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'agent-b1', 'Linux'),
    ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'agent-b2', 'macOS');

\echo '5. Creating test tasks...'
INSERT INTO tasks (id, tenant_id, agent_id, task_type, command, status) VALUES
    ('t0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'command', 'whoami', 'pending'),
    ('t0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'command', 'whoami', 'pending');

\echo ''
\echo '========================================='
\echo 'Test 1: Operator A Access (Tenant A only)'
\echo '========================================='
SET app.current_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

\echo 'Tenants visible to operator_a (expect 1: Tenant A):'
SELECT id, name FROM tenants ORDER BY name;

\echo 'Agents visible to operator_a (expect 2: agent-a1, agent-a2):'
SELECT id, hostname, os FROM agents ORDER BY hostname;

\echo 'Tasks visible to operator_a (expect 1 task):'
SELECT id, task_type, command, status FROM tasks ORDER BY created_at;

\echo ''
\echo '========================================='
\echo 'Test 2: Operator B Access (Tenant B only)'
\echo '========================================='
SET app.current_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

\echo 'Tenants visible to operator_b (expect 1: Tenant B):'
SELECT id, name FROM tenants ORDER BY name;

\echo 'Agents visible to operator_b (expect 2: agent-b1, agent-b2):'
SELECT id, hostname, os FROM agents ORDER BY hostname;

\echo 'Tasks visible to operator_b (expect 1 task):'
SELECT id, task_type, command, status FROM tasks ORDER BY created_at;

\echo ''
\echo '========================================='
\echo 'Test 3: Admin Access (All tenants)'
\echo '========================================='
SET app.current_user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

\echo 'Tenants visible to admin_user (expect 3: Default + Tenant A + Tenant B):'
SELECT id, name FROM tenants ORDER BY name;

\echo 'Agents visible to admin_user (expect 4: all test agents):'
SELECT id, hostname, os FROM agents WHERE id LIKE 'a0000000%' OR id LIKE 'b0000000%' ORDER BY hostname;

\echo 'Tasks visible to admin_user (expect 2 test tasks):'
SELECT id, task_type, command, status FROM tasks WHERE id LIKE 't0000000%' ORDER BY created_at;

\echo ''
\echo '========================================='
\echo 'Test 4: Cross-Tenant Write Attempt (Should Fail)'
\echo '========================================='
SET app.current_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

\echo 'operator_a attempting to insert agent into Tenant B (EXPECT ERROR):'
INSERT INTO agents (tenant_id, hostname, os) VALUES
    ('22222222-2222-2222-2222-222222222222', 'malicious-agent', 'Linux');

\echo ''
\echo '========================================='
\echo 'Expected Results Summary:'
\echo '  - Operator A: 1 tenant (A), 2 agents (a1, a2), 1 task'
\echo '  - Operator B: 1 tenant (B), 2 agents (b1, b2), 1 task'
\echo '  - Admin: 3 tenants (Default + A + B), 4 agents, 2 tasks'
\echo '  - Cross-tenant write: MUST FAIL with RLS violation'
\echo '========================================='
