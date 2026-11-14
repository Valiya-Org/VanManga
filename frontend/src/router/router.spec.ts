import { describe, it, expect } from 'vitest';
import { createRouter, createMemoryHistory } from 'vue-router';
import { routes } from './index';

async function resolve(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(path);
  await router.isReady();
  return router.currentRoute.value;
}

describe('router', () => {
  it('serves the library at /', async () => {
    expect((await resolve('/')).name).toBe('library');
  });

  it('serves settings at /settings', async () => {
    expect((await resolve('/settings')).name).toBe('settings');
  });

  it.each(['/mainpage', '/mainpage/searchpage', '/mainpage/mangaku', '/mainpage/a/b'])(
    'redirects legacy %s to /',
    async (path) => {
      const route = await resolve(path);
      expect(route.fullPath).toBe('/');
      expect(route.name).toBe('library');
    },
  );

  it('redirects unknown paths to /', async () => {
    expect((await resolve('/nope/nope')).fullPath).toBe('/');
  });
});
