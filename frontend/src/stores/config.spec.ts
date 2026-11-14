import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { http } from '@/api/http';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { useConfigStore } from './config';

let server: FakeServer;
beforeEach(() => {
  setActivePinia(createPinia());
  server = fakeServer(http);
});
afterEach(() => server.restore());

describe('config store', () => {
  it('defaults to everything off before loading', () => {
    const c = useConfigStore();
    expect(c.config).toBeNull();
    expect(c.kavitaEnabled).toBe(false);
    expect(c.adminRequired).toBe(false);
    expect(c.kavitaExposeUrl).toBeNull();
  });

  it('loads GET /api/config', async () => {
    server.reply(200, {
      code: 200,
      data: { kavitaEnabled: true, kavitaExposeUrl: 'http://k', adminRequired: true },
    });
    const c = useConfigStore();
    await c.load();
    expect(server.lastRequest()!.url).toBe('config');
    expect(c.kavitaEnabled).toBe(true);
    expect(c.kavitaExposeUrl).toBe('http://k');
    expect(c.adminRequired).toBe(true);
    expect(c.loading).toBe(false);
    expect(c.error).toBeNull();
  });

  it('records a failure instead of throwing', async () => {
    server.networkError();
    const c = useConfigStore();
    await expect(c.load()).resolves.toBeUndefined();
    expect(c.error).toMatchObject({ error: 'network-error' });
    expect(c.loading).toBe(false);
  });
});
