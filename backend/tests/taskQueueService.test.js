const taskQueueService = require('../services/taskQueueService');
const redisClient = require('../utils/redisClient');

jest.mock('../utils/redisClient', () => ({
  getKey: jest.fn(),
  rPush: jest.fn(),
  publish: jest.fn(),
  lLen: jest.fn(),
  lRange: jest.fn(),
  lRem: jest.fn(),
  lPop: jest.fn(),
  hSet: jest.fn(),
  expire: jest.fn()
}));

describe('TaskQueueService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('enqueueTask normalizes legacy `command` -> `cmd` and pushes to Redis', async () => {
    const agentId = 'agent-1';
    const tenantId = 'tenant-1';
    const task = { id: 't1', command: 'whoami' };

    redisClient.getKey.mockImplementation((category, identifier, tid) => `${category}:${identifier}:${tid}`);
    redisClient.rPush.mockResolvedValue(1);
    redisClient.publish.mockResolvedValue(1);
    redisClient.lLen.mockResolvedValue(2);

    const res = await taskQueueService.enqueueTask(agentId, task, tenantId);

    expect(redisClient.rPush).toHaveBeenCalled();
    const pushed = JSON.parse(redisClient.rPush.mock.calls[0][1]);
    expect(pushed.cmd).toBe('whoami');
    expect(res.success).toBe(true);
    expect(res.queueLength).toBe(2);
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

    const res = await taskQueueService.removeTaskFromQueue(agentId, tenantId, taskId);

    expect(redisClient.lRange).toHaveBeenCalled();
    expect(redisClient.lRem).toHaveBeenCalledWith('queue:agent', 1, itemB);
    expect(res.removed).toBe(true);
  });

  test('dequeueTask pops an item and stores it in processing with expire', async () => {
    const agentId = 'agent-zzz';
    const tenantId = 'tenant-xxx';
    const queued = JSON.stringify({ id: 'dq1', cmd: 'whoami' });

    redisClient.getKey.mockImplementation((category, identifier, tid) => `${category}:${identifier}:${tid}`);
    redisClient.lPop.mockResolvedValue(queued);
    redisClient.hSet.mockResolvedValue(1);
    redisClient.expire.mockResolvedValue(1);

    const task = await taskQueueService.dequeueTask(agentId, tenantId);

    expect(redisClient.lPop).toHaveBeenCalled();
    expect(redisClient.hSet).toHaveBeenCalled();
    expect(redisClient.expire).toHaveBeenCalled();
    expect(task.id).toBe('dq1');
  });
});
