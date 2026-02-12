const TaskService = require('../services/taskService');

jest.mock('../models/Task', () => ({
  getAllForAgent: jest.fn()
}));

jest.mock('../models/Result', () => ({
  getLatestForTask: jest.fn()
}));

const TaskModel = require('../models/Task');
const ResultModel = require('../models/Result');

describe('TaskService.getAllTasks', () => {
  beforeEach(() => {
    TaskModel.getAllForAgent.mockClear();
    ResultModel.getLatestForTask.mockClear();
  });

  test('attaches latest result and maps timestamps', async () => {
    const mockTasks = [
      { id: 't1', created_at: '2026-02-12T10:00:00Z', completed_at: '2026-02-12T10:01:00Z' }
    ];

    TaskModel.getAllForAgent.mockResolvedValueOnce(mockTasks);
    ResultModel.getLatestForTask.mockResolvedValueOnce({ stdout: 'ok', error_message: null });

    const res = await TaskService.getAllTasks('agent-1');

    expect(Array.isArray(res)).toBe(true);
    expect(res[0].result).toBe('ok');
    expect(res[0].error).toBeNull();
    expect(res[0].createdAt).toBe(mockTasks[0].created_at);
    expect(res[0].completedAt).toBe(mockTasks[0].completed_at);
  });
});
