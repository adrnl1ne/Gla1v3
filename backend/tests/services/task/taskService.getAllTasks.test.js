const TaskService = require('../../../services/taskService');
const TaskModel = require('../../../models/Task');
const ResultModel = require('../../../models/Result');

jest.mock('../../../models/Task', () => ({
  getAllForAgent: jest.fn()
}));

jest.mock('../../../models/Result', () => ({
  getLatestForTask: jest.fn()
}));

describe('TaskService.getAllTasks', () => {
  beforeEach(() => jest.clearAllMocks());

  test('enriches tasks with latest result and normalizes fields', async () => {
    TaskModel.getAllForAgent.mockResolvedValue([{ id: 't1', task_type: 'embedded', embedded_type: 'proc_list' }]);
    ResultModel.getLatestForTask.mockResolvedValue({ stdout: 'ok' });

    const res = await TaskService.getAllTasks('agent-1');
    expect(res[0].result).toBe('ok');
    expect(res[0].type).toBe('embedded');
  });

  test('handles missing latest result and embedded-type normalization', async () => {
    TaskModel.getAllForAgent.mockResolvedValue([{ id: 't2', task_type: 'embedded', embedded_type: 'startup' }]);
    ResultModel.getLatestForTask.mockResolvedValue(null);

    const res = await TaskService.getAllTasks('agent-2');
    expect(res[0].result).toBeNull();
    expect(res[0].error).toBeNull();
    expect(res[0].type).toBe('embedded');
    expect(res[0].embeddedType).toBe('startup');
  });

  test('maps command tasks and exposes error when present', async () => {
    TaskModel.getAllForAgent.mockResolvedValue([{ id: 't3', task_type: 'command', command: 'whoami' }]);
    ResultModel.getLatestForTask.mockResolvedValue({ stdout: null, error_message: 'failed' });

    const res = await TaskService.getAllTasks('agent-3');
    expect(res[0].type).toBe('command');
    expect(res[0].command).toBe('whoami');
    expect(res[0].result).toBeNull();
    expect(res[0].error).toBe('failed');
  });
});