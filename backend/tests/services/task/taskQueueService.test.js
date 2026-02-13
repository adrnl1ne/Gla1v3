const TaskQueueService = require('../../../services/taskQueueService');
const redisClient = require('../../../utils/redisClient');

jest.mock('../../../utils/redisClient', () => ({
  getKey: jest.fn(),
  rPush: jest.fn(),
  publish: jest.fn(),
  lLen: jest.fn(),
  lRange: jest.fn(),
  lRem: jest.fn(),
  lPop: jest.fn(),
  hSet: jest.fn(),
  hGetAll: jest.fn(),
  hDel: jest.fn(),
  hExists: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  expire: jest.fn()
}));

describe('TaskQueueService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('enqueueTask logs and enqueues', async () => {
    redisClient.getKey.mockImplementation((category, identifier, tid) => `${category}:${identifier}:${tid}`);
    redisClient.rPush.mockResolvedValue(1);
    redisClient.publish.mockResolvedValue(1);
    redisClient.lLen.mockResolvedValue(2);

    const res = await TaskQueueService.enqueueTask('agent-1', { id: 't1', command: 'whoami' }, 'tenant-1');

    expect(redisClient.getKey).toHaveBeenCalled();
    expect(redisClient.rPush).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.queueLength).toBe(2);
  });

  test('dequeueTask returns task', async () => {
    const queued = JSON.stringify({ id: 'dq1', cmd: 'whoami' });
    redisClient.getKey.mockImplementation((category, identifier, tid) => `${category}:${identifier}:${tid}`);
    redisClient.lPop.mockResolvedValue(queued);
    redisClient.hSet.mockResolvedValue(1);
    redisClient.expire.mockResolvedValue(1);

    const task = await TaskQueueService.dequeueTask('agent-zzz', 'tenant-xxx');

    expect(redisClient.lPop).toHaveBeenCalled();
    expect(redisClient.hSet).toHaveBeenCalled();
    expect(task.id).toBe('dq1');
  });

  test('getPendingTasks returns parsed JSON list', async () => {
    const itemA = JSON.stringify({ id: 'a1' });
    const itemB = JSON.stringify({ id: 'a2' });
    redisClient.getKey.mockReturnValue('queue:agent');
    redisClient.lRange.mockResolvedValue([itemA, itemB]);

    const pending = await TaskQueueService.getPendingTasks('agent-1', 't1');
    expect(Array.isArray(pending)).toBe(true);
    expect(pending[0].id).toBe('a1');
  });

  test('removeTaskFromQueue removes matching JSON item and returns removed true', async () => {
    const agentId = 'agent-1';
    const tenantId = 'tenant-1';
    const taskId = 't-remove';

    const itemA = JSON.stringify({ id: 'other' });
    const itemB = JSON.stringify({ id: 't-remove' });

    redisClient.getKey.mockReturnValue('queue:agent');
    redisClient.lRange.mockResolvedValue([itemA, itemB]);
    redisClient.lRem.mockResolvedValue(1);

    const res = await TaskQueueService.removeTaskFromQueue(agentId, tenantId, taskId);

    expect(redisClient.lRange).toHaveBeenCalled();
    expect(redisClient.lRem).toHaveBeenCalledWith('queue:agent', 1, itemB);
    expect(res.removed).toBe(true);
  });

  test('completeTask deletes processing hash entry', async () => {
    redisClient.getKey.mockReturnValue('processing:agent');
    redisClient.hDel.mockResolvedValue(1);

    const res = await TaskQueueService.completeTask('agent-1', 'task-1', 't1');
    expect(redisClient.hDel).toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  test('getProcessingTasks returns mapped entries', async () => {
    const stored = { task1: JSON.stringify({ task: { id: 'task1' }, dequeuedAt: new Date().toISOString() }) };
    redisClient.getKey.mockReturnValue('processing:agent');
    redisClient.hGetAll.mockResolvedValue(stored);

    const res = await TaskQueueService.getProcessingTasks('agent-1', 't1');
    expect(res[0]).toHaveProperty('taskId', 'task1');
  });

  test('subscribe/unsubscribe manage activeSubscriptions', async () => {
    const cb = jest.fn();
    redisClient.getKey.mockReturnValue('channel:agent');

    // simulate subscribe invoking the handler with valid JSON
    redisClient.subscribe = jest.fn(async (ch, handler) => { handler(JSON.stringify({ type: 'NEW_TASK' })); });
    redisClient.unsubscribe = jest.fn(async (ch) => { /* no-op */ });

    const svc = new (require('../../../services/taskQueueService').constructor)();
    await svc.subscribeToAgentTasks('agent-1', 't1', cb);
    expect(svc.activeSubscriptions.size).toBe(1);
    expect(cb).toHaveBeenCalledWith({ type: 'NEW_TASK' });

    await svc.unsubscribeFromAgentTasks('agent-1', 't1');
    expect(svc.activeSubscriptions.size).toBe(0);
  });

  test('subscribe handles parse error without throwing', async () => {
    const cb = jest.fn();
    redisClient.getKey.mockReturnValue('channel:agent');
    redisClient.subscribe = jest.fn(async (ch, handler) => { handler('not-json'); });

    const svc = new (require('../../../services/taskQueueService').constructor)();
    await expect(svc.subscribeToAgentTasks('agent-2', 't2', cb)).resolves.not.toThrow();
  });

  test('broadcastTaskToTenant publishes to tenant channel', async () => {
    redisClient.getKey.mockReturnValue('channel:tenant:broadcast:1');
    redisClient.publish.mockResolvedValue(1);

    const res = await TaskQueueService.broadcastTaskToTenant({ task_id: 'b1' }, 1);
    expect(redisClient.publish).toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  test('clearAgentQueue deletes both keys', async () => {
    redisClient.getKey.mockReturnValue('queue:agent');
    redisClient.del = jest.fn().mockResolvedValue(1);

    const res = await TaskQueueService.clearAgentQueue('agent-x', 1);
    expect(redisClient.del).toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  test('getTenantQueueStats aggregates keys and lengths', async () => {
    redisClient.getKey.mockReturnValue('queue:agent:*:1');
    redisClient.keys = jest.fn().mockResolvedValue(['queue:agent:agent-A:1', 'queue:agent:agent-B:1']);
    redisClient.lLen.mockImplementation((key) => Promise.resolve(key.includes('A') ? 2 : 3));

    const stats = await TaskQueueService.getTenantQueueStats(1);
    expect(stats.totalPending).toBe(5);
    expect(stats.agentCount).toBe(2);
    expect(stats.agentStats.length).toBe(2);
  });

  test('getTenantQueueStats returns defaults on error', async () => {
    redisClient.getKey.mockReturnValue('queue:agent:*:1');
    redisClient.keys = jest.fn().mockImplementation(() => { throw new Error('redis error'); });

    const stats = await TaskQueueService.getTenantQueueStats(1);
    expect(stats.totalPending).toBe(0);
    expect(stats.agentCount).toBe(0);
  });

  test('getQueueLength returns lLen result', async () => {
    redisClient.getKey.mockReturnValue('queue:agent');
    redisClient.lLen.mockResolvedValue(3);

    const len = await TaskQueueService.getQueueLength('agent-1', 't1');
    expect(len).toBe(3);
  });
});