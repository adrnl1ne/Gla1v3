const { validateSecrets, config } = require('../../../config/env');

describe('env.validateSecrets', () => {
  const ORIGINAL_ENV = { ...process.env };
  let exitSpy;
  let warnSpy;
  let errorSpy;
  let logSpy;

  beforeEach(() => {
    jest.resetModules();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  test('returns early when not production and ALLOW_INSECURE_DEFAULTS=true', () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_INSECURE_DEFAULTS = 'true';

    validateSecrets();

    expect(warnSpy).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('exits process when required secrets are missing or insecure', () => {
    // Ensure required secrets are not set / are insecure
    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.INTERNAL_TOKEN;
    delete process.env.AGENT_WHOAMI_TOKEN;

    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_INSECURE_DEFAULTS; // ensure validation runs

    validateSecrets();

    expect(errorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('succeeds when all required secrets are present and long enough', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_INSECURE_DEFAULTS;

    // Provide strong secrets (>16 chars)
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.ADMIN_PASSWORD = 'b'.repeat(20);
    process.env.INTERNAL_TOKEN = 'c'.repeat(24);
    process.env.AGENT_WHOAMI_TOKEN = 'd'.repeat(24);

    validateSecrets();

    expect(logSpy).toHaveBeenCalledWith('✅ All required secrets validated successfully');
    expect(exitSpy).not.toHaveBeenCalled();
  });
});