const tokenBlacklistService = require('../services/tokenBlacklistService');
const db = require('../db/connection');
const redisClient = require('../utils/redisClient');
const CAClient = require('../utils/caClient');

jest.mock('../db/connection', () => ({
  query: jest.fn()
}));

jest.mock('../utils/redisClient', () => ({
  getKey: jest.fn(),
  set: jest.fn(),
  sAdd: jest.fn(),
  del: jest.fn(),
  sRem: jest.fn(),
  exists: jest.fn(),
  get: jest.fn(),
  ttl: jest.fn(),
  sMembers: jest.fn()
}));

jest.mock('../utils/caClient', () => ({
  revokeCertificate: jest.fn()
}));

describe('TokenBlacklistService.blacklistAgentToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls CAClient.revokeCertificate when agent has cert_id', async () => {
    db.query.mockImplementation((sql, params) => {
      if (sql && sql.toString().includes('INSERT INTO agent_blacklist')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql && sql.toString().includes('SELECT cert_id, cert_fingerprint FROM agents')) {
        return Promise.resolve({ rows: [{ cert_id: 'cert-abc-123', cert_fingerprint: 'ff1' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    redisClient.getKey.mockReturnValue('blacklist:agent:agent-1:tenant-1');
    redisClient.set.mockResolvedValue('OK');
    redisClient.sAdd.mockResolvedValue(1);

    CAClient.revokeCertificate.mockResolvedValue({ success: true, certId: 'cert-abc-123' });

    const res = await tokenBlacklistService.blacklistAgentToken('agent-1', 'dummy-token', 'Compromised', 1, 3600);

    expect(redisClient.set).toHaveBeenCalled();
    expect(CAClient.revokeCertificate).toHaveBeenCalledWith('cert-abc-123', expect.any(String));
    expect(res.success).toBe(true);
  });

  test('stores fingerprint when cert_id absent and feature flag enabled', async () => {
    db.query.mockImplementation((sql, params) => {
      if (sql && sql.toString().includes('INSERT INTO agent_blacklist')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql && sql.toString().includes('SELECT cert_id, cert_fingerprint FROM agents')) {
        return Promise.resolve({ rows: [{ cert_id: null, cert_fingerprint: 'deadbeefcafefeed' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    // Enable feature flag for this test
    jest.resetModules();
    const env = require('../config/env');
    env.config.enableEmbeddedCertRevocation = true;

    redisClient.getKey.mockImplementation((category, identifier, tid) => {
      if (category === 'blacklist:cert:fingerprint') return tid ? `tenant:${tid}:blacklist:cert:fingerprint:${identifier}` : `blacklist:cert:fingerprint:${identifier}`;
      return `blacklist:agent:${identifier}:${tid}`;
    });

    redisClient.set.mockResolvedValue('OK');
    redisClient.sAdd.mockResolvedValue(1);

    const res = await tokenBlacklistService.blacklistAgentToken('agent-2', 'dummy-token', 'Compromised', 1, 3600);

    expect(redisClient.set).toHaveBeenCalled();
    expect(CAClient.revokeCertificate).not.toHaveBeenCalled();
    expect(redisClient.set).toHaveBeenCalledWith('tenant:1:blacklist:cert:fingerprint:deadbeefcafefeed', expect.any(String), 3600);
    expect(redisClient.set).toHaveBeenCalledWith('blacklist:cert:fingerprint:deadbeefcafefeed', expect.any(String), 3600);
    expect(res.success).toBe(true);
  });

  test('isCertFingerprintRevoked returns true for stored fingerprint', async () => {
    redisClient.exists.mockImplementation((key) => Promise.resolve(1));

    const res = await tokenBlacklistService.isCertFingerprintRevoked('anything', 1);
    expect(res).toBe(true);

    // When tenant key absent, global present
    redisClient.exists.mockImplementationOnce(() => Promise.resolve(0)).mockImplementationOnce(() => Promise.resolve(1));
    const res2 = await tokenBlacklistService.isCertFingerprintRevoked('anything', 1);
    expect(res2).toBe(true);
  });
});
