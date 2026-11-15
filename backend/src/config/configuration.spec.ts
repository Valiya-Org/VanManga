import { Logger } from '@nestjs/common';
import { join, resolve, sep } from 'path';
import configuration from './configuration';

describe('configuration: kavita.enabled', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  function withKavita(env: Record<string, string | undefined>) {
    for (const k of ['KAVITA_BASE_URL', 'KAVITA_EXPOSE_URL', 'KAVITA_ADMIN_APIKEY']) {
      delete process.env[k];
    }
    Object.assign(process.env, env);
    return configuration().kavita.enabled;
  }

  it('is true only when base URL, expose URL and admin API key are all set (like Flask)', () => {
    expect(
      withKavita({
        KAVITA_BASE_URL: 'http://kavita:5000',
        KAVITA_EXPOSE_URL: 'https://kavita.example.com',
        KAVITA_ADMIN_APIKEY: 'key',
      }),
    ).toBe(true);
  });

  it.each([
    ['only the API key', { KAVITA_ADMIN_APIKEY: 'key' }],
    ['no expose URL', { KAVITA_BASE_URL: 'http://kavita:5000', KAVITA_ADMIN_APIKEY: 'key' }],
    ['no base URL', { KAVITA_EXPOSE_URL: 'https://k', KAVITA_ADMIN_APIKEY: 'key' }],
    ['nothing', {}],
  ])('is false with %s', (_label, env) => {
    expect(withKavita(env)).toBe(false);
  });
});

describe('configuration: storage.queueFile', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults to queue.json next to the library file', () => {
    delete process.env.QUEUE_FILE;
    process.env.LIBRARY_FILE = join(sep, 'data', 'cfg', 'manga_library.json');
    expect(configuration().storage.queueFile).toBe(resolve(sep, 'data', 'cfg', 'queue.json'));
  });

  it('QUEUE_FILE overrides it', () => {
    process.env.QUEUE_FILE = join(sep, 'elsewhere', 'q.json');
    expect(configuration().storage.queueFile).toBe(resolve(sep, 'elsewhere', 'q.json'));
  });
});

describe('configuration: security.adminToken', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('is empty (protection off) when ADMIN_TOKEN is unset or blank', () => {
    delete process.env.ADMIN_TOKEN;
    expect(configuration().security.adminToken).toBe('');
    process.env.ADMIN_TOKEN = '   ';
    expect(configuration().security.adminToken).toBe('');
  });

  it('reads ADMIN_TOKEN', () => {
    process.env.ADMIN_TOKEN = 's3cret';
    expect(configuration().security.adminToken).toBe('s3cret');
  });
});

describe('configuration: numeric env values', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('uses the default when unset or blank', () => {
    delete process.env.NUMBER_OF_WORKERS;
    expect(configuration().concurrency.workers).toBe(2);
    process.env.NUMBER_OF_WORKERS = '  ';
    expect(configuration().concurrency.workers).toBe(2);
  });

  it('reads a whole number (surrounding spaces allowed)', () => {
    process.env.NUMBER_OF_WORKERS = ' 4 ';
    process.env.IMAGE_DELAY_MS = '0';
    const cfg = configuration();
    expect(cfg.concurrency.workers).toBe(4);
    expect(cfg.download.imageDelayMs).toBe(0);
  });

  it.each([
    ['NUMBER_OF_WORKERS', 'two'],
    ['NUMBER_OF_WORKERS', '2abc'],
    ['NUMBER_OF_WORKERS', '0'],
    ['IMAGE_CONCURRENCY', '-1'],
    ['IMAGE_DELAY_MS', '1.5'],
    ['PORT', 'http'],
    ['PYTHON_TIMEOUT_MS', '0'],
  ])('fails fast on %s=%p', (name, value) => {
    process.env[name] = value;
    expect(() => configuration()).toThrow(new RegExp(`Invalid ${name}=`));
  });
});

describe('configuration: legacy LIB_PATH', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  it('warns when the Flask-era LIB_PATH is set without LIBRARY_FILE', () => {
    const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    process.env.LIB_PATH = '/old/lib.json';
    delete process.env.LIBRARY_FILE;
    configuration();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('LIB_PATH'), 'Configuration');

    warn.mockClear();
    process.env.LIBRARY_FILE = '/old/lib.json';
    configuration();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('configuration: security.corsOrigins', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('is empty (CORS off) when CORS_ORIGINS is unset or blank', () => {
    delete process.env.CORS_ORIGINS;
    expect(configuration().security.corsOrigins).toEqual([]);
    process.env.CORS_ORIGINS = ' , ';
    expect(configuration().security.corsOrigins).toEqual([]);
  });

  it('splits a comma-separated list', () => {
    process.env.CORS_ORIGINS = 'http://a.example, http://b.example:8080';
    expect(configuration().security.corsOrigins).toEqual(['http://a.example', 'http://b.example:8080']);
  });
});
