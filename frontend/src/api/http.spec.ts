import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AxiosHeaders } from 'axios';
import { ApiError, isApiError } from './errors';
import { http, request, setAdminTokenProvider } from './http';
import { fakeServer, type FakeServer } from '@/test/fake-server';

let server: FakeServer;

beforeEach(() => {
  server = fakeServer(http);
});

afterEach(() => {
  server.restore();
  setAdminTokenProvider(null);
});

describe('http instance', () => {
  it('targets the same-origin /api prefix', () => {
    expect(http.defaults.baseURL).toBe('/api');
  });
});

describe('request()', () => {
  it('unwraps the success envelope to its data', async () => {
    server.reply(200, { code: 200, data: { hello: 'world' } });
    await expect(request<{ hello: string }>({ url: 'x' })).resolves.toEqual({
      hello: 'world',
    });
  });

  it('resolves falsy data such as null and false as-is', async () => {
    server.reply(200, { code: 200, data: null });
    await expect(request({ url: 'x' })).resolves.toBeNull();
    server.reply(200, { code: 200, data: false });
    await expect(request({ url: 'x' })).resolves.toBe(false);
  });

  it('converts a failure envelope into an ApiError', async () => {
    server.reply(409, {
      code: 409,
      error: 'duplicate',
      message: 'Similar manga already in the library',
      data: { duplicates: ['A'] },
    });

    const err = await request({ url: 'x' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(isApiError(err)).toBe(true);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(409);
    expect(apiErr.error).toBe('duplicate');
    expect(apiErr.message).toBe('Similar manga already in the library');
    expect(apiErr.data).toEqual({ duplicates: ['A'] });
  });

  it.each([
    [400, 'validation-failed'],
    [401, 'admin-token-required'],
    [403, 'kavita-login-failed'],
    [404, 'manga-not-found'],
    [410, 'search-expired'],
    [451, 'dmca'],
    [500, 'internal-error'],
    [502, 'scraper-blocked'],
  ])('keeps status %i and error %s from the envelope', async (status, error) => {
    server.reply(status, { code: status, error });
    await expect(request({ url: 'x' })).rejects.toMatchObject({ status, error });
  });

  it('keeps an unknown error string verbatim', async () => {
    server.reply(418, { code: 418, error: 'http-418' });
    await expect(request({ url: 'x' })).rejects.toMatchObject({
      status: 418,
      error: 'http-418',
    });
  });

  it('maps a non-envelope error body to http-<status>', async () => {
    server.reply(502, '<html>Bad Gateway</html>');
    await expect(request({ url: 'x' })).rejects.toMatchObject({
      status: 502,
      error: 'http-502',
    });
  });

  it('maps a 2xx body that is not an envelope to invalid-response', async () => {
    server.reply(200, '<html>index</html>');
    await expect(request({ url: 'x' })).rejects.toMatchObject({
      status: 200,
      error: 'invalid-response',
    });
  });

  it('maps a missing response to network-error with status 0', async () => {
    server.networkError();
    await expect(request({ url: 'x' })).rejects.toMatchObject({
      status: 0,
      error: 'network-error',
    });
  });
});

describe('admin token header', () => {
  function sentHeader(): string | undefined {
    const headers = AxiosHeaders.from(server.lastRequest()!.headers);
    return headers.get('X-Admin-Token') as string | undefined;
  }

  it('is omitted when no provider is set', async () => {
    server.reply(200, { code: 200, data: true });
    await request({ url: 'x' });
    expect(sentHeader()).toBeUndefined();
  });

  it('is omitted when the provider has no token', async () => {
    setAdminTokenProvider(() => null);
    server.reply(200, { code: 200, data: true });
    await request({ url: 'x' });
    expect(sentHeader()).toBeUndefined();
  });

  it('carries the current token from the provider', async () => {
    let token = 'first';
    setAdminTokenProvider(() => token);
    server.reply(200, { code: 200, data: true });
    await request({ url: 'x' });
    expect(sentHeader()).toBe('first');

    token = 'second';
    await request({ url: 'x' });
    expect(sentHeader()).toBe('second');
  });
});
