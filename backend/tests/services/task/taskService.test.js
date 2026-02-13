const TaskService = require('../../../services/taskService');

jest.mock('../../../models/Task', () => ({
  create: jest.fn(),
  getPendingForAgent: jest.fn(),
  getAllForAgent: jest.fn(),
  updateResult: jest.fn(),
  getByTenant: jest.fn()
}));

const TaskModel = require('../../../models/Task');

describe('TaskService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('createTask delegates to TaskModel.create', async () => {
    TaskModel.create.mockResolvedValue({ id: 't1' });
    const res = await TaskService.createTask('agent-1', { cmd: 'whoami' }, 1);
    expect(TaskModel.create).toHaveBeenCalledWith('agent-1', { cmd: 'whoami' }, 1, null);
    expect(res).toEqual({ id: 't1' });
  });

  test('getPendingTasks delegates to TaskModel.getPendingForAgent', async () => {
    TaskModel.getPendingForAgent.mockResolvedValue([{ id: 'p1' }]);
    const res = await TaskService.getPendingTasks('agent-1');
    expect(res).toEqual([{ id: 'p1' }]);
  });

  test('updateTaskResult delegates to TaskModel.updateResult', async () => {
    TaskModel.updateResult.mockResolvedValue({ success: true });
    const res = await TaskService.updateTaskResult('agent-1', 'task-1', 'out', null);
    expect(TaskModel.updateResult).toHaveBeenCalledWith('agent-1', 'task-1', 'out', null);
    expect(res).toEqual({ success: true });
  });

  test('getByTenant delegates to TaskModel.getByTenant', async () => {
    TaskModel.getByTenant.mockResolvedValue([{ id: 't-a' }]);
    const res = await TaskService.getByTenant(1);
    expect(res).toEqual([{ id: 't-a' }]);
  });
});