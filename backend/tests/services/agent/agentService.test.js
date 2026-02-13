const AgentService = require('../../../services/agentService');

// Mock dependencies
jest.mock('../../../models/Agent', () => ({
  findByCN: jest.fn(),
  register: jest.fn(),
  update: jest.fn(),
  findById: jest.fn(),
  getAll: jest.fn()
}));

jest.mock('../../../models/Tenant', () => ({
  getDefault: jest.fn()
}));

jest.mock('../../../utils/caClient', () => ({
  generateCertificate: jest.fn()
}));

const AgentModel = require('../../../models/Agent');
const TenantModel = require('../../../models/Tenant');
const CAClient = require('../../../utils/caClient');

describe('AgentService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('handleBeacon - registers new agent when none exists and CA generates cert', async () => {
    AgentModel.findByCN.mockResolvedValue(null);
    TenantModel.getDefault.mockResolvedValue({ id: 99 });
    CAClient.generateCertificate.mockResolvedValue({ certId: 'cert-123' });
    AgentModel.register.mockResolvedValue({ id: 'agent-new', cn: 'cn-1', cert_id: 'cert-123' });

    const agentData = { hostname: 'h1', os: 'linux', arch: 'x86', user: 'u1', ip: '1.2.3.4' };

    const res = await AgentService.handleBeacon(agentData, null);

    expect(TenantModel.getDefault).toHaveBeenCalled();
    expect(CAClient.generateCertificate).toHaveBeenCalled();
    expect(AgentModel.register).toHaveBeenCalledWith(expect.objectContaining({ hostname: 'h1', cert_id: 'cert-123' }), 99);
    expect(res).toEqual(expect.objectContaining({ id: 'agent-new', cert_id: 'cert-123' }));
  });

  test('handleBeacon - updates existing agent when found', async () => {
    const existing = { id: 'agent-1', cn: 'cn-1' };
    AgentModel.findByCN.mockResolvedValue(existing);
    AgentModel.update.mockResolvedValue({ id: 'agent-1', cn: 'cn-1', hostname: 'h2' });

    const agentData = { hostname: 'h2', os: 'linux', arch: 'x86', user: 'u2', ip: '4.3.2.1' };

    const res = await AgentService.handleBeacon(agentData, null, 5);

    expect(AgentModel.update).toHaveBeenCalledWith('agent-1', expect.objectContaining({ hostname: 'h2' }));
    expect(res).toEqual(expect.objectContaining({ id: 'agent-1', hostname: 'h2' }));
  });

  test('handleBeacon - computes certFingerprint when clientCert provided', async () => {
    // Spy on native crypto to return a deterministic digest for the test
    const crypto = require('crypto');
    const spy = jest.spyOn(crypto, 'createHash').mockImplementation(() => ({
      update: () => ({ digest: () => 'deadbeef' })
    }));

    AgentModel.findByCN.mockResolvedValue(null);
    TenantModel.getDefault.mockResolvedValue({ id: 7 });
    CAClient.generateCertificate.mockResolvedValue({ certId: null });
    AgentModel.register.mockResolvedValue({ id: 'agent-x', certFingerprint: 'deadbeef' });

    const fakePem = '-----BEGIN CERTIFICATE-----\nQUJDRA==\n-----END CERTIFICATE-----';

    const res = await AgentService.handleBeacon({ hostname: 'h-x' }, fakePem);

    // verify crypto was invoked and the returned agent contains the fingerprint
    expect(spy).toHaveBeenCalled();
    expect(res.certFingerprint).toBe('deadbeef');

    spy.mockRestore();
  });

  test('extractCNFromCert returns parse-error for invalid pem', () => {
    const res = AgentService.extractCNFromCert('not-a-pem');
    expect(res).toBe('parse-error');
  });

  test('getAllAgents delegates to AgentModel.getAll', async () => {
    AgentModel.getAll.mockResolvedValue([{ id: 'a1' }]);
    const res = await AgentService.getAllAgents(1);
    expect(res).toEqual([{ id: 'a1' }]);
    expect(AgentModel.getAll).toHaveBeenCalledWith(1);
  });

  test('getAgent tries findById then fallback to findByCN when not UUID', async () => {
    AgentModel.findById.mockResolvedValueOnce(null);
    AgentModel.findByCN.mockResolvedValueOnce({ id: 'bycn' });

    const res = await AgentService.getAgent('friendly-cn');
    expect(res).toEqual({ id: 'bycn' });
    expect(AgentModel.findByCN).toHaveBeenCalledWith('friendly-cn');
  });
});
