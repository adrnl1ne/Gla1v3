const TaskModel = require('../../../models/Task');
const db = require('../../../db/connection');

jest.mock('../../../db/connection', () => ({
  query: jest.fn()
}));

describe('TaskModel.updateResult', () => {
  beforeEach(() => jest.clearAllMocks());

  test('complete_task stored and returns task', async () => {
    db.query.mockResolvedValueOnce({ rows: [ { id: 't1' } ] });
    db.query.mockResolvedValueOnce({ rows: [ { id: 't1', status: 'completed' } ] });

    const res = await TaskModel.updateResult('agent-1', 't1', 'output', null);
    expect(res.id).toBe('t1');
  });
});