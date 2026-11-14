import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { AxiosHeaders } from 'axios';
import { http, setAdminTokenProvider } from '@/api/http';
import { deleteManga } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { KAVITA_STORAGE_KEY, useSessionStore } from './session';

let server: FakeServer;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  server = fakeServer(http);
});
afterEach(() => {
  server.restore();
  setAdminTokenProvider(null);
});

const LOGIN = {
  apiKey: 'key',
  jwt: 'jwt1',
  refreshToken: 'rt1',
  loginUrl: 'http://kavita/login?apiKey=key',
};

function tokenHeaderOf(i: number): string | undefined {
  return AxiosHeaders.from(server.requests[i].headers).get('X-Admin-Token') as
    | string
    | undefined;
}

describe('session store · Kavita', () => {
  it('starts logged out', () => {
    const s = useSessionStore();
    expect(s.kavitaLoggedIn).toBe(false);
    expect(s.kavitaLoginUrl).toBeNull();
  });

  it('logs in, exposes loginUrl and persists the session', async () => {
    server.reply(200, { code: 200, data: LOGIN });
    const s = useSessionStore();

    await s.kavitaLogin('u', 'p');

    expect(s.kavitaLoggedIn).toBe(true);
    expect(s.kavitaLoginUrl).toBe(LOGIN.loginUrl);
    expect(JSON.parse(localStorage.getItem(KAVITA_STORAGE_KEY)!)).toEqual(LOGIN);
  });

  it('restores a persisted Kavita session on creation', () => {
    localStorage.setItem(KAVITA_STORAGE_KEY, JSON.stringify(LOGIN));
    expect(useSessionStore().kavitaLoginUrl).toBe(LOGIN.loginUrl);
  });

  it('ignores a corrupt persisted session', () => {
    localStorage.setItem(KAVITA_STORAGE_KEY, '{nope');
    expect(useSessionStore().kavitaLoggedIn).toBe(false);
  });

  it('stays logged out and rethrows when Kavita rejects the login', async () => {
    server.reply(403, { code: 403, error: 'kavita-login-failed' });
    const s = useSessionStore();
    await expect(s.kavitaLogin('u', 'bad')).rejects.toMatchObject({
      error: 'kavita-login-failed',
    });
    expect(s.kavitaLoggedIn).toBe(false);
    expect(localStorage.getItem(KAVITA_STORAGE_KEY)).toBeNull();
  });

  it('refreshes the tokens and keeps apiKey/loginUrl', async () => {
    server.replyOnce(200, { code: 200, data: LOGIN });
    server.replyOnce(200, { code: 200, data: { jwt: 'jwt2', refreshToken: 'rt2' } });
    const s = useSessionStore();
    await s.kavitaLogin('u', 'p');

    await s.refreshKavitaToken();

    expect(server.lastBody()).toEqual({ jwt: 'jwt1', refreshToken: 'rt1' });
    expect(s.kavita).toEqual({ ...LOGIN, jwt: 'jwt2', refreshToken: 'rt2' });
    expect(JSON.parse(localStorage.getItem(KAVITA_STORAGE_KEY)!).jwt).toBe('jwt2');
  });

  it('logs out when the refresh token is rejected', async () => {
    localStorage.setItem(KAVITA_STORAGE_KEY, JSON.stringify(LOGIN));
    server.reply(403, { code: 403, error: 'kavita-refresh-failed' });
    const s = useSessionStore();

    await expect(s.refreshKavitaToken()).rejects.toBeInstanceOf(ApiError);

    expect(s.kavitaLoggedIn).toBe(false);
    expect(localStorage.getItem(KAVITA_STORAGE_KEY)).toBeNull();
  });

  it('keeps the session when the refresh fails for another reason', async () => {
    localStorage.setItem(KAVITA_STORAGE_KEY, JSON.stringify(LOGIN));
    server.reply(502, { code: 502, error: 'kavita-unreachable' });
    const s = useSessionStore();
    await expect(s.refreshKavitaToken()).rejects.toBeInstanceOf(ApiError);
    expect(s.kavitaLoggedIn).toBe(true);
  });

  it('refresh without a session is a no-op', async () => {
    await useSessionStore().refreshKavitaToken();
    expect(server.requests).toHaveLength(0);
  });

  it('logout clears state and storage', () => {
    localStorage.setItem(KAVITA_STORAGE_KEY, JSON.stringify(LOGIN));
    const s = useSessionStore();
    s.kavitaLogout();
    expect(s.kavitaLoggedIn).toBe(false);
    expect(localStorage.getItem(KAVITA_STORAGE_KEY)).toBeNull();
  });
});

describe('session store · admin token', () => {
  it('sends the in-memory token as X-Admin-Token and never persists it', async () => {
    server.reply(200, { code: 200, data: true });
    const s = useSessionStore();
    s.setAdminToken('secret');

    await deleteManga('m');

    expect(tokenHeaderOf(0)).toBe('secret');
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('secret');
  });

  it('is gone in a fresh session (new store instance)', () => {
    useSessionStore().setAdminToken('secret');
    setActivePinia(createPinia());
    expect(useSessionStore().adminToken).toBeNull();
  });

  it('withAdmin: passes through success without prompting', async () => {
    server.reply(200, { code: 200, data: true });
    const ask = vi.fn();
    const s = useSessionStore();
    s.setAdminTokenPrompt(ask);
    await expect(s.withAdmin(() => deleteManga('m'))).resolves.toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('withAdmin: on 401 asks for the token and retries the original call', async () => {
    server.replyOnce(401, { code: 401, error: 'admin-token-required' });
    server.replyOnce(200, { code: 200, data: true });
    const ask = vi.fn().mockResolvedValue('secret');
    const s = useSessionStore();
    s.setAdminTokenPrompt(ask);

    await expect(s.withAdmin(() => deleteManga('m'))).resolves.toBe(true);

    expect(ask).toHaveBeenCalledWith({ reason: 'admin-token-required' });
    expect(server.requests).toHaveLength(2);
    expect(tokenHeaderOf(0)).toBeUndefined();
    expect(tokenHeaderOf(1)).toBe('secret');
    expect(s.adminToken).toBe('secret');
  });

  it('withAdmin: a wrong token clears it and asks again', async () => {
    server.replyOnce(401, { code: 401, error: 'admin-token-invalid' });
    server.replyOnce(200, { code: 200, data: true });
    const ask = vi.fn().mockResolvedValue('right');
    const s = useSessionStore();
    s.setAdminToken('wrong');
    s.setAdminTokenPrompt(ask);

    await s.withAdmin(() => deleteManga('m'));

    expect(ask).toHaveBeenCalledWith({ reason: 'admin-token-invalid' });
    expect(tokenHeaderOf(0)).toBe('wrong');
    expect(tokenHeaderOf(1)).toBe('right');
  });

  it('withAdmin: keeps asking until the user cancels, then rethrows the 401', async () => {
    server.reply(401, { code: 401, error: 'admin-token-invalid' });
    const ask = vi
      .fn()
      .mockResolvedValueOnce('bad1')
      .mockResolvedValueOnce('bad2')
      .mockResolvedValueOnce(null);
    const s = useSessionStore();
    s.setAdminTokenPrompt(ask);

    await expect(s.withAdmin(() => deleteManga('m'))).rejects.toMatchObject({
      status: 401,
      error: 'admin-token-invalid',
    });
    expect(ask).toHaveBeenCalledTimes(3);
    expect(server.requests).toHaveLength(3);
    expect(s.adminToken).toBeNull();
  });

  it('withAdmin: without a registered prompt the 401 propagates', async () => {
    server.reply(401, { code: 401, error: 'admin-token-required' });
    await expect(useSessionStore().withAdmin(() => deleteManga('m'))).rejects.toMatchObject({
      error: 'admin-token-required',
    });
  });

  it('withAdmin: non-401 errors propagate without prompting', async () => {
    server.reply(409, { code: 409, error: 'manga-busy' });
    const ask = vi.fn();
    const s = useSessionStore();
    s.setAdminTokenPrompt(ask);
    await expect(s.withAdmin(() => deleteManga('m'))).rejects.toMatchObject({
      error: 'manga-busy',
    });
    expect(ask).not.toHaveBeenCalled();
  });

  it('withAdmin: concurrent 401s share one prompt', async () => {
    server.replyOnce(401, { code: 401, error: 'admin-token-required' });
    server.replyOnce(401, { code: 401, error: 'admin-token-required' });
    server.reply(200, { code: 200, data: true });
    let answer!: (t: string) => void;
    const ask = vi.fn(() => new Promise<string>((r) => (answer = r)));
    const s = useSessionStore();
    s.setAdminTokenPrompt(ask);

    const both = Promise.all([
      s.withAdmin(() => deleteManga('a')),
      s.withAdmin(() => deleteManga('b')),
    ]);
    await vi.waitFor(() => expect(ask).toHaveBeenCalled());
    answer('secret');

    await expect(both).resolves.toEqual([true, true]);
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
