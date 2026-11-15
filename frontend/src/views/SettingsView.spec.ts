import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useToast } from '@nuxt/ui/composables';
import { defineComponent, h, type Ref } from 'vue';
import { http } from '@/api/http';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { mountWithApp, findButton, click, bodyText, waitForText } from '@/test/mount';
import { useConfigStore } from '@/stores/config';
import { useSessionStore } from '@/stores/session';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import AdminTokenDialog from '@/components/common/AdminTokenDialog.vue';
import SettingsView from './SettingsView.vue';

let server: FakeServer;
beforeEach(() => {
  server = fakeServer(http);
  localStorage.clear();
});
afterEach(() => {
  server.restore();
  vi.restoreAllMocks();
});
enableAutoUnmount(afterEach);

/** The live toast list, captured inside the harness (toasts are global). */
let toasts: Ref<{ id: string | number }[]>;
const toastIds = () => toasts.value.map((t) => t.id);

const Harness = defineComponent({
  setup: () => {
    toasts = useToast().toasts;
    return () => [h(SettingsView), h(ConfirmDialog), h(AdminTokenDialog)];
  },
});

async function mountSettings(kavitaEnabled: boolean, seed?: () => void) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useConfigStore().config = { kavitaEnabled, kavitaExposeUrl: kavitaEnabled ? 'http://k' : null, adminRequired: true };
  seed?.();
  return (await mountWithApp(Harness, { pinia, path: '/settings' })).wrapper;
}

async function type(selector: string, value: string): Promise<void> {
  const el = document.querySelector<HTMLInputElement>(selector)!;
  el.value = value;
  el.dispatchEvent(new Event('input'));
  await flushPromises();
}

describe('SettingsView · Kavita', () => {
  it('says Kavita is not enabled on the server', async () => {
    const w = await mountSettings(false);
    expect(w.find('[data-testid="kavita-disabled"]').text()).toBe('服务器未启用 Kavita');
    expect(w.find('[data-testid="kavita-login"]').exists()).toBe(false);
  });

  it('logs in with username and password', async () => {
    const w = await mountSettings(true);
    expect(w.find('[data-testid="kavita-login"]').exists()).toBe(true);
    await type('input[data-testid="kavita-username"]', 'van');
    await type('input[data-testid="kavita-password"]', 'pw');
    server.replyOnce(200, {
      code: 200,
      data: { apiKey: 'a', jwt: 'j', refreshToken: 'r', loginUrl: 'http://k/login?apiKey=a' },
    });
    await click(findButton('登录'));
    await flushPromises();
    expect(server.lastBody()).toEqual({ username: 'van', password: 'pw' });
    expect(w.find('[data-testid="kavita-logged-in"]').exists()).toBe(true);
  });

  it('shows a login failure inline', async () => {
    const w = await mountSettings(true);
    await type('input[data-testid="kavita-username"]', 'van');
    await type('input[data-testid="kavita-password"]', 'bad');
    server.replyOnce(403, { code: 403, error: 'kavita-login-failed' });
    await click(findButton('登录'));
    await flushPromises();
    expect(w.find('[data-testid="kavita-login"] [role="alert"]').text()).toBe('Kavita 用户名或密码错误');
  });

  it('when logged in, opens Kavita and logs out', async () => {
    const w = await mountSettings(true, () => {
      localStorage.setItem('vanmanga.kavita', JSON.stringify({ loginUrl: 'http://k/login?apiKey=a' }));
    });
    expect(useSessionStore().kavitaLoggedIn).toBe(true);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await click(findButton('打开 Kavita'));
    expect(open).toHaveBeenCalledWith('http://k/login?apiKey=a', '_blank', 'noopener,noreferrer');
    await click(findButton('退出登录'));
    expect(w.find('[data-testid="kavita-login"]').exists()).toBe(true);
    expect(localStorage.getItem('vanmanga.kavita')).toBeNull();
  });

  it('refuses to open a non-http Kavita link', async () => {
    await mountSettings(true, () => {
      localStorage.setItem('vanmanga.kavita', JSON.stringify({ loginUrl: 'javascript:alert(1)' }));
    });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await click(findButton('打开 Kavita'));
    expect(open).not.toHaveBeenCalled();
    await waitForText('Kavita 地址无效，无法打开');
  });
});

describe('SettingsView · maintenance and about', () => {
  it('re-zips after confirmation, asking for the admin token', async () => {
    await mountSettings(false);
    await click(findButton('重新打包全部漫画'));
    expect(bodyText()).toContain('重新打包全部漫画？');
    server.replyOnce(401, { code: 401, error: 'admin-token-required' });
    server.replyOnce(200, { code: 200, data: { taskId: 'z' } });
    await click(document.querySelector('[data-testid="confirm-ok"]'));
    await type('input[type="password"]', 'tok');
    await click(findButton('确认'));
    await flushPromises();
    expect(server.lastRequest()?.url).toBe('library/rezip');
    expect(server.lastRequest()?.headers['X-Admin-Token']).toBe('tok');
    await waitForText('已加入下载队列');
  });

  it('cancelling the admin-token prompt aborts the re-zip silently', async () => {
    await mountSettings(false);
    await click(findButton('重新打包全部漫画'));
    server.replyOnce(401, { code: 401, error: 'admin-token-required' });
    await click(document.querySelector('[data-testid="confirm-ok"]'));
    expect(bodyText()).toContain('需要管理员口令');
    const before = toastIds();
    await click(findButton('取消'));
    for (let i = 0; i < 5; i++) await flushPromises();
    expect(server.requests).toHaveLength(1);
    expect(toastIds()).toEqual(before);
    expect(findButton('重新打包全部漫画')?.disabled).toBe(false);
  });

  it('shows the Valiya logo in the about section', async () => {
    const w = await mountSettings(false);
    expect(w.find('img[alt="Valiya"]').classes()).toContain('invert');
  });
});
