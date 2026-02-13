const tokenBlacklistService = require('../../../services/tokenBlacklistService');
const db = require('../../../db/connection');
const redisClient = require('../../../utils/redisClient');
const CAClient = require('../../../utils/caClient');

jest.mock('../../../db/connection', () => ({
  query: jest.fn()
}));

jest.mock('../../../utils/redisClient', () => ({
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

jest.mock('../../../utils/caClient', () => ({
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
    const env = require('../../../config/env');
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

  test('blacklistAgentToken returns alreadyExpired when token exp in past', async () => {
    // Reload modules so we can mock jsonwebtoken before service is required
    jest.resetModules();
    jest.doMock('jsonwebtoken', () => ({ decode: () => ({ exp: Math.floor(Date.now() / 1000) - 10 }) }));

    const tokenBlacklistServiceReloaded = require('../../../services/tokenBlacklistService');

    const res = await tokenBlacklistServiceReloaded.blacklistAgentToken('agent-x', 'expired-token', 'test', 1);
    expect(res.alreadyExpired).toBe(true);

    // restore module cache for subsequent tests
    jest.resetModules();
  });

  test('blacklistAgentToken continues when DB persistence fails', async () => {
    db.query.mockImplementation((sql, params) => {
      if (sql && sql.toString().includes('INSERT INTO agent_blacklist')) {
        return Promise.reject(new Error('DB down'));
      }
      if (sql && sql.toString().includes('SELECT cert_id, cert_fingerprint FROM agents')) {
        return Promise.resolve({ rows: [{ cert_id: null, cert_fingerprint: null }] });
      }
      return Promise.resolve({ rows: [] });
    });

    redisClient.getKey.mockReturnValue('blacklist:agent:agent-dbfail:1');
    redisClient.set.mockResolvedValue('OK');
    redisClient.sAdd.mockResolvedValue(1);

    const res = await tokenBlacklistService.blacklistAgentToken('agent-dbfail', 'token', 'reason', 1, 3600);
    expect(res.success).toBe(true);
    expect(redisClient.set).toHaveBeenCalled();
  });

  test('isAgentBlacklisted returns false on Redis error (fail open)', async () => {
    redisClient.getKey.mockReturnValue('k');
    redisClient.exists.mockImplementation(() => { throw new Error('redis down'); });

    const res = await tokenBlacklistService.isAgentBlacklisted('agent-1', 1);
    expect(res).toBe(false);
  });

  test('getBlacklistInfo returns null when no metadata and returns info when present', async () => {
    redisClient.getKey.mockReturnValue('k');
    redisClient.get.mockResolvedValue(null);

    const none = await tokenBlacklistService.getBlacklistInfo('agent-xx', 1);
    expect(none).toBeNull();

    const metadata = JSON.stringify({ token: 'tok', reason: 'x' });
    redisClient.get.mockResolvedValueOnce(metadata);
    redisClient.ttl.mockResolvedValueOnce(120);

    const info = await tokenBlacklistService.getBlacklistInfo('agent-xx', 1);
    expect(info).toHaveProperty('remainingTTL', 120);
  });

  test('removeFromBlacklist deletes redis keys and marks DB revoked', async () => {
    redisClient.getKey.mockReturnValue('k');
    redisClient.del.mockResolvedValue(1);
    redisClient.sRem.mockResolvedValue(1);
    db.query.mockResolvedValue({ rows: [{ affected: 1 }] });

    const res = await tokenBlacklistService.removeFromBlacklist('agent-del', 1);
    expect(redisClient.del).toHaveBeenCalled();
    expect(redisClient.sRem).toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  test('getBlacklistedAgents returns populated list', async () => {
    redisClient.getKey.mockReturnValue('blacklist:set:agents:1');
    redisClient.sMembers.mockResolvedValue(['a1']);
    redisClient.get.mockResolvedValue(JSON.stringify({ token: 't', reason: 'r' }));
    redisClient.ttl.mockResolvedValue(100);

    const res = await tokenBlacklistService.getBlacklistedAgents(1);
    expect(res).toHaveLength(1);
    expect(res[0]).toHaveProperty('agentId', 'a1');
  });

  test('blacklistUserToken and isUserTokenBlacklisted handle jti and fallback', async () => {
    const jwt = require('jsonwebtoken');
    jest.spyOn(jwt, 'decode').mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600, jti: 'jti-1' });

    redisClient.getKey.mockReturnValue('blacklist:user:jti-1');
    redisClient.set.mockResolvedValue('OK');

    const res = await tokenBlacklistService.blacklistUserToken('token', 'user-1', 'reason');
    expect(res.success).toBe(true);

    redisClient.exists.mockResolvedValue(1);
    const isBlack = await tokenBlacklistService.isUserTokenBlacklisted('token');
    expect(isBlack).toBe(true);

    jwt.decode.mockRestore();
  });

  test('syncFromDatabase writes entries to Redis', async () => {
    db.query.mockResolvedValue({ rows: [{ agent_id: 'a-sync', tenant_id: 1, reason: 'x', expires_at: new Date(Date.now() + 3600).toISOString(), blacklisted_at: new Date().toISOString() }] });
    redisClient.getKey.mockReturnValue('k');
    redisClient.set.mockResolvedValue('OK');
    redisClient.sAdd.mockResolvedValue(1);

    const res = await tokenBlacklistService.syncFromDatabase();
    expect(res.synced).toBe(1);
  });
});