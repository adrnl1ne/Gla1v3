const TaskModel = require('../models/Task');
const db = require('../db/connection');

jest.mock('../db/connection', () => ({
  query: jest.fn()
}));

describe('TaskModel.updateResult', () => {
  beforeEach(() => {
    db.query.mockClear();
  });

  test('normalizes empty-string error to null when calling complete_task', async () => {
    // Mock complete_task select + findById
    db.query.mockResolvedValueOnce({ rows: [{ "select": "ok" }] }); // complete_task call
    db.query.mockResolvedValueOnce({ rows: [{ id: 'task-1', status: 'completed' }] }); // findById

    await TaskModel.updateResult('agent-1', 'task-1', 'stdout-data', '');

    // First call is the SELECT complete_task(...), params[3] should be null (dbError)
    expect(db.query).toHaveBeenCalled();
    const firstCallParams = db.query.mock.calls[0][1];
    expect(firstCallParams[3]).toBeNull();
  });

  test('passes non-empty error through to complete_task', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ "select": "ok" }] });
    db.query.mockResolvedValueOnce({ rows: [{ id: 'task-2', status: 'failed' }] });

    await TaskModel.updateResult('agent-1', 'task-2', 'stdout-data', 'some error');

    const firstCallParams = db.query.mock.calls[0][1];
    expect(firstCallParams[3]).toBe('some error');
  });
});
