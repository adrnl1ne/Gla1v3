const EDRService = require('../../../services/edrService');

describe('EDRService', () => {
  beforeEach(() => {
    // reset in-memory store by reloading module state
    jest.resetModules();
  });

  test('initialize adds default wazuh config and getAllConfigs masks password', () => {
    const svc = require('../../../services/edrService');
    svc.initialize();

    const configs = svc.getAllConfigs();
    const defaultCfg = configs.find(c => c.id === 'wazuh-default');
    expect(defaultCfg).toBeDefined();
    // password field should be present and masked when set (either '***' or empty string if not configured)
    expect(typeof defaultCfg.pass).toBe('string');
    expect(['', '***']).toContain(defaultCfg.pass);
  });

  test('createConfig, getConfig, updateConfig and deleteConfig', () => {
    const svc = require('../../../services/edrService');

    const created = svc.createConfig({ name: 'T1', type: 'opensearch', url: 'http://x', user: 'u', pass: 'p', authMethod: 'basic' });
    expect(created.id).toMatch(/^edr-/);

    const fetched = svc.getConfig(created.id);
    expect(fetched).toBeDefined();

    const updated = svc.updateConfig(created.id, { name: 'T2', enabled: false });
    expect(updated.name).toBe('T2');
    expect(updated.enabled).toBe(false);

    const deleted = svc.deleteConfig(created.id);
    expect(deleted).toBe(true);
    expect(svc.getConfig(created.id)).toBeUndefined();
  });

  test('parseOpenSearchResponse maps hits to alerts', () => {
    const svc = require('../../../services/edrService');

    const fakeResp = {
      hits: {
        hits: [
          { _id: '1', _source: { timestamp: '2025-01-01T00:00:00Z', rule: { level: 5, description: 'd1' }, agent: { name: 'agent1' } } }
        ]
      }
    };

    const edr = { id: 'e1', name: 'E1' };
    const alerts = svc.parseOpenSearchResponse(fakeResp, edr);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: '1', edrId: 'e1', agent: 'agent1', level: 5 });
  });

  test('fetchAlerts aggregates alerts from multiple EDR configs', async () => {
    const svc = require('../../../services/edrService');
    jest.resetModules();
    const Svc = require('../../../services/edrService');

    // create two configs
    const c1 = Svc.createConfig({ name: 'one', type: 'opensearch', url: 'http://a', endpoints: { alerts: '/a', query: {} } });
    const c2 = Svc.createConfig({ name: 'two', type: 'opensearch', url: 'http://b', endpoints: { alerts: '/b', query: {} } });

    // stub fetchFromEDR to return different alerts
    jest.spyOn(Svc, 'fetchFromEDR').mockImplementation(async (edr) => {
      return [{ id: `${edr.name}-alert`, timestamp: '2025-01-02T00:00:00Z' }];
    });

    const alerts = await Svc.fetchAlerts();
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    expect(alerts.some(a => a.id === 'one-alert')).toBe(true);
    expect(alerts.some(a => a.id === 'two-alert')).toBe(true);
  });

  test('fetchFromEDR performs HTTP request and parses response', async () => {
    const svc = require('../../../services/edrService');
    jest.resetModules();
    const Svc = require('../../../services/edrService');

    // prepare a fake EDR config that uses http
    const edr = { id: 'x', name: 'X', url: 'http://example.test', endpoints: { alerts: '/_search', query: {} }, authMethod: 'none' };

    // mock http.request
    const http = require('http');
    const fakeResp = { hits: { hits: [{ _id: 'r1', _source: { timestamp: '2025-01-01T00:00:00Z', agent: { name: 'a1' }, rule: { level: 3, description: 'd' } } }] } };

    const originalRequest = http.request;
    http.request = (url, options, cb) => {
      const EventEmitter = require('events');
      const res = new EventEmitter();
      res.statusCode = 200;

      // simulate async data/end
      process.nextTick(() => {
        cb(res);
        res.emit('data', JSON.stringify(fakeResp));
        res.emit('end');
      });

      return {
        on: () => {},
        write: () => {},
        end: () => {}
      };
    };

    const alerts = await Svc.fetchFromEDR(edr);
    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts[0]).toHaveProperty('id', 'r1');

    // restore
    http.request = originalRequest;
  });
});
