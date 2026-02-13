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
});