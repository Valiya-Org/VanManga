import { describe, it, expect } from 'vitest';
import { createRouter, createMemoryHistory } from 'vue-router';
import { routes } from './index';

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes });
}

describe('router', () => {
  it('redirects / to /mainpage/searchpage', async () => {
    const router = makeRouter();
    await router.push('/');
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe('/mainpage/searchpage');
  });

  it('redirects /mainpage to /mainpage/searchpage', async () => {
    const router = makeRouter();
    await router.push('/mainpage');
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe('/mainpage/searchpage');
  });

  it('resolves /mainpage/mangaku to MangaKu', async () => {
    const router = makeRouter();
    await router.push('/mainpage/mangaku');
    await router.isReady();
    expect(router.currentRoute.value.matched.at(-1)?.name).toBe('MangaKu');
  });

  it('resolves /mainpage/kavitaLinkCheck to KavitaCheck', async () => {
    const router = makeRouter();
    await router.push('/mainpage/kavitaLinkCheck');
    await router.isReady();
    expect(router.currentRoute.value.matched.at(-1)?.name).toBe('KavitaCheck');
  });

  it('falls back unknown paths to Error', async () => {
    const router = makeRouter();
    await router.push('/nope/nope');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Error');
  });
});
