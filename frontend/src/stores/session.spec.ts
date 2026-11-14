import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { AxiosHeaders } from 'axios';
import { http, setAdminTokenProvider } from '@/api/http';
import { deleteManga } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { nextTick } from 'vue';
import { useConfigStore } from './config';
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

  it('logs in, exposes loginUrl and persists only the login link', async () => {
    server.reply(200, { code: 200, data: LOGIN });
    const s = useSessionStore();

    await s.kavitaLogin('u', 'p');

    expect(s.kavitaLoggedIn).toBe(true);
    expect(s.kavitaLoginUrl).toBe(LOGIN.loginUrl);
    const stored = localStorage.getItem(KAVITA_STORAGE_KEY)!;
    expect(JSON.parse(stored)).toEqual({ loginUrl: LOGIN.loginUrl });
    expect(stored).not.toContain('jwt1');
    expect(stored).not.toContain('rt1');
  });

  it('restores a persisted login link on creation', () => {
    localStorage.setItem(KAVITA_STORAGE_KEY, JSON.stringify({ loginUrl: LOGIN.loginUrl }));
    expect(useSessionStore().kavitaLoginUrl).toBe(LOGIN.loginUrl);
  });

  it('migrates an old-format entry: keeps the link, drops jwt and refresh token', () => {
    localStorage.setItem(KAVITA_STORAGE_KEY, JSON.stringify(LOGIN));
    const s = useSessionStore();
    expect(s.kavitaLoginUrl).toBe(LOGIN.loginUrl);
    expect(JSON.parse(localStorage.getItem(KAVITA_STORAGE_KEY)!)).toEqual({
      loginUrl: LOGIN.loginUrl,
    });
  });

  it.each([['{nope'], ['{"jwt":"x"}'], ['null'], ['{"loginUrl":""}']])(
    'removes an unusable stored entry %s',
    (raw) => {
      localStorage.setItem(KAVITA_STORAGE_KEY, raw);
      expect(useSessionStore().kavitaLoggedIn).toBe(false);
      expect(localStorage.getItem(KAVITA_STORAGE_KEY)).toBeNull();
    },
  );

  it.each(['kavita-disabled', 'kavita-refresh-failed'])(
    'a %s response clears the stored link',
    async (error) => {
      localStorage.setItem(KAVITA_STORAGE_KEY, JSON.stringify({ loginUrl: LOGIN.loginUrl }));
      server.reply(error === 'kavita-disabled' ? 404 : 403, { code: 403, error });
      const s = useSessionStore();
      await expect(s.kavitaLogin('u', 'p')).rejects.toMatchObject({ error });
      expect(s.kavitaLoggedIn).toBe(false);
      expect(localStorage.getItem(KAVITA_STORAGE_KEY)).toBeNull();
    },
  );

  it('a failed login for another reason keeps the stored link', async () => {
    localStorage.setItem(KAVITA_STORAGE_KEY, JSON.stringify({ loginUrl: LOGIN.loginUrl }));
    server.reply(502, { code: 502, error: 'kavita-unreachable' });
    const s = useSessionStore();
    await expect(s.kavitaLogin('u', 'p')).rejects.toBeInstanceOf(ApiError);
    expect(s.kavitaLoggedIn).toBe(true);
  });

  it('clears the stored link once the config says Kavita is disabled', async () => {
    localStorage.setItem(KAVITA_STORAGE_KEY, JSON.stringify({ loginUrl: LOGIN.loginUrl }));
    const s = useSessionStore();
    server.reply(200, {
      code: 200,
      data: { kavitaEnabled: false, kavitaExposeUrl: null, adminRequired: false },
    });
    await useConfigStore().load();
    await nextTick();
    expect(s.kavitaLoggedIn).toBe(false);
    expect(localStorage.getItem(KAVITA_STORAGE_KEY)).toBeNull();
  });

  it('keeps the stored link when the config enables Kavita or fails to load', async () => {
    localStorage.setItem(KAVITA_STORAGE_KEY, JSON.stringify({ loginUrl: LOGIN.loginUrl }));
    const s = useSessionStore();
    server.networkError();
    await useConfigStore().load();
    server.reply(200, {
      code: 200,
      data: { kavitaEnabled: true, kavitaExposeUrl: 'http://k', adminRequired: false },
    });
    await useConfigStore().load();
    await nextTick();
    expect(s.kavitaLoggedIn).toBe(true);
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

  it('withAdmin: a rejected token is cleared from memory and the user is asked again', async () => {
    server.replyOnce(401, { code: 401, error: 'admin-token-invalid' });
    server.replyOnce(200, { code: 200, data: true });
    const s = useSessionStore();
    let tokenWhileAsking: string | null | undefined;
    const ask = vi.fn(async () => {
      tokenWhileAsking = s.adminToken;
      return 'right';
    });
    s.setAdminToken('wrong');
    s.setAdminTokenPrompt(ask);

    await s.withAdmin(() => deleteManga('m'));

    expect(ask).toHaveBeenCalledWith({ reason: 'admin-token-invalid' });
    expect(tokenWhileAsking).toBeNull();
    expect(tokenHeaderOf(0)).toBe('wrong');
    expect(tokenHeaderOf(1)).toBe('right');
    expect(s.adminToken).toBe('right');
  });

  it('withAdmin: cancelling after a rejection leaves no token in memory', async () => {
    server.reply(401, { code: 401, error: 'admin-token-invalid' });
    const s = useSessionStore();
    s.setAdminToken('wrong');
    s.setAdminTokenPrompt(async () => null);
    await expect(s.withAdmin(() => deleteManga('m'))).rejects.toMatchObject({
      error: 'admin-token-invalid',
    });
    expect(s.adminToken).toBeNull();
  });

  it('withAdmin: cancelling a "required" prompt rejects without retrying', async () => {
    server.reply(401, { code: 401, error: 'admin-token-required' });
    const s = useSessionStore();
    s.setAdminTokenPrompt(async () => null);
    await expect(s.withAdmin(() => deleteManga('m'))).rejects.toMatchObject({
      error: 'admin-token-required',
    });
    expect(s.adminToken).toBeNull();
    expect(server.requests).toHaveLength(1);
  });

  it('withAdmin: a 401 for a request sent before the token changed retries without prompting', async () => {
    const a = server.replyDeferred();
    const b = server.replyDeferred();
    server.reply(200, { code: 200, data: true });
    const ask = vi.fn().mockResolvedValue('secret');
    const s = useSessionStore();
    s.setAdminTokenPrompt(ask);

    const first = s.withAdmin(() => deleteManga('a'));
    const second = s.withAdmin(() => deleteManga('b'));
    await Promise.all([a.received, b.received]);

    a.resolve(401, { code: 401, error: 'admin-token-required' });
    await expect(first).resolves.toBe(true);
    b.resolve(401, { code: 401, error: 'admin-token-required' });
    await expect(second).resolves.toBe(true);

    expect(ask).toHaveBeenCalledTimes(1);
    expect(server.requests).toHaveLength(4);
    expect(tokenHeaderOf(3)).toBe('secret');
  });

  it('withAdmin: a caller joining an open prompt does not get a stale reason later', async () => {
    // A opens a "required" prompt; B's request was sent with a token that is
    // then rejected while the prompt is open. B waits for the same prompt.
    // The answer is wrong for both, so the next prompt must say "invalid".
    const aFirst = server.replyDeferred();
    server.replyOnce(401, { code: 401, error: 'admin-token-invalid' }); // B with 'x'
    server.reply(401, { code: 401, error: 'admin-token-invalid' }); // retries with 'bad'
    let answerFirst!: (t: string | null) => void;
    let answerSecond!: (t: string | null) => void;
    const ask = vi
      .fn<(req: { reason: string }) => Promise<string | null>>()
      .mockImplementationOnce(() => new Promise((r) => (answerFirst = r)))
      .mockImplementationOnce(() => new Promise((r) => (answerSecond = r)));
    const s = useSessionStore();
    s.setAdminTokenPrompt(ask);

    const a = s.withAdmin(() => deleteManga('a')).catch((e: unknown) => e);
    await aFirst.received;
    aFirst.resolve(401, { code: 401, error: 'admin-token-required' });
    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(1));

    s.setAdminToken('x');
    const b = s.withAdmin(() => deleteManga('b')).catch((e: unknown) => e);
    await vi.waitFor(() => expect(server.requests).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 0)); // B's 401 handled, B now waiting
    expect(ask).toHaveBeenCalledTimes(1); // B joined, no second dialog
    expect(s.adminToken).toBeNull(); // B's rejected 'x' cleared

    answerFirst('bad');
    await vi.waitFor(() => expect(server.requests).toHaveLength(4)); // both retried with 'bad'
    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(ask).toHaveBeenCalledTimes(2); // both share the second dialog
    answerSecond(null);
    const [ea, eb] = await Promise.all([a, b]);

    expect(ask.mock.calls.map((c) => c[0].reason)).toEqual([
      'admin-token-required',
      'admin-token-invalid',
    ]);
    expect(ea).toMatchObject({ error: 'admin-token-invalid' });
    expect(eb).toMatchObject({ error: 'admin-token-invalid' });
    expect(s.adminToken).toBeNull();
  });

  it('withAdmin: the prompt returning the just-rejected token asks again instead of retrying', async () => {
    server.reply(401, { code: 401, error: 'admin-token-invalid' });
    const ask = vi
      .fn()
      .mockResolvedValueOnce('wrong')
      .mockResolvedValueOnce('wrong')
      .mockResolvedValueOnce(null);
    const s = useSessionStore();
    s.setAdminToken('wrong');
    s.setAdminTokenPrompt(ask);

    await expect(s.withAdmin(() => deleteManga('m'))).rejects.toMatchObject({
      error: 'admin-token-invalid',
    });

    expect(server.requests).toHaveLength(1);
    expect(ask).toHaveBeenCalledTimes(3);
    for (const [req] of ask.mock.calls) expect(req).toEqual({ reason: 'admin-token-invalid' });
    expect(s.adminToken).toBeNull();
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
