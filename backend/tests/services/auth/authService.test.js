const AuthService = require('../../../services/authService');

// Mock dependencies
jest.mock('../../../models/User', () => ({
  findByUsername: jest.fn(),
  verifyPassword: jest.fn(),
  getTenants: jest.fn()
}));

jest.mock('../../../services/twoFactorService', () => ({
  isTwoFactorEnabled: jest.fn()
}));

jest.mock('../../../services/sessionService', () => ({
  create: jest.fn(),
  delete: jest.fn()
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'signed-token')
}));

// Add TenantModel and UserModel create mocks for initializeDefaultAdmin tests
jest.mock('../../../models/Tenant', () => ({
  getDefault: jest.fn(),
  assignUser: jest.fn()
}));

jest.mock('../../../models/User', () => ({
  findByUsername: jest.fn(),
  verifyPassword: jest.fn(),
  getTenants: jest.fn(),
  create: jest.fn()
}));

const UserModel = require('../../../models/User');
const TwoFactorService = require('../../../services/twoFactorService');
const SessionService = require('../../../services/sessionService');
const TenantModel = require('../../../models/Tenant');
const jwt = require('jsonwebtoken');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('login throws when user not found', async () => {
    UserModel.findByUsername.mockResolvedValue(null);

    await expect(AuthService.login('noone', 'pw')).rejects.toThrow('Invalid credentials');
  });

  test('login throws when password invalid', async () => {
    UserModel.findByUsername.mockResolvedValue({ id: 'u1', username: 'u1' });
    UserModel.verifyPassword.mockResolvedValue(false);

    await expect(AuthService.login('u1', 'bad')).rejects.toThrow('Invalid credentials');
  });

  test('login returns requires2FA when enabled', async () => {
    UserModel.findByUsername.mockResolvedValue({ id: 'u2', username: 'u2', role: 'operator' });
    UserModel.verifyPassword.mockResolvedValue(true);
    TwoFactorService.isTwoFactorEnabled.mockResolvedValue(true);

    const res = await AuthService.login('u2', 'pw');
    expect(res.requires2FA).toBe(true);
    expect(res.tempToken).toBe('signed-token');
  });

  test('completeLogin returns token, sessionId and tenants', async () => {
    UserModel.getTenants.mockResolvedValue([
      { id: 't1', name: 'Default', description: 'Default tenant' }
    ]);

    SessionService.create.mockResolvedValue({ sessionId: 'sess-1', expiresAt: Date.now() + 1000 });

    const res = await AuthService.completeLogin('u3', 'user3', 'admin');

    expect(SessionService.create).toHaveBeenCalledWith('u3', 'user3', 'admin');
    expect(jwt.sign).toHaveBeenCalled();
    expect(res.token).toBe('signed-token');
    expect(res.sessionId).toBe('sess-1');
    expect(res.tenants).toEqual([{ id: 't1', name: 'Default', description: 'Default tenant' }]);
  });

  test('logout calls SessionService.delete', async () => {
    SessionService.delete.mockResolvedValue(true);
    const res = await AuthService.logout('sess-1');
    expect(SessionService.delete).toHaveBeenCalledWith('sess-1');
    expect(res).toBe(true);
  });

  test('initializeDefaultAdmin does nothing when admin exists', async () => {
    UserModel.findByUsername.mockResolvedValue({ id: 'admin' });
    await AuthService.initializeDefaultAdmin();
    expect(UserModel.create).not.toHaveBeenCalled();
  });

  test('initializeDefaultAdmin creates admin and assigns to default tenant when missing', async () => {
    UserModel.findByUsername.mockResolvedValue(null);
    UserModel.create.mockResolvedValue({ id: 'new-admin', username: 'admin' });
    TenantModel.getDefault.mockResolvedValue({ id: 't-default' });
    TenantModel.assignUser.mockResolvedValue(true);

    await AuthService.initializeDefaultAdmin();

    expect(UserModel.create).toHaveBeenCalled();
    expect(TenantModel.assignUser).toHaveBeenCalledWith('t-default', 'new-admin');
  });
});