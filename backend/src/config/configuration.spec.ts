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
