import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { http } from '@/api/http';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { mountWithApp, findButton, click } from '@/test/mount';
import { useSessionStore } from '@/stores/session';
import { deleteManga } from '@/api/endpoints';
import AdminTokenDialog from './AdminTokenDialog.vue';

let server: FakeServer;
beforeEach(() => (server = fakeServer(http)));
afterEach(() => server.restore());
enableAutoUnmount(afterEach);

const required = { code: 401, error: 'admin-token-required' };
const invalid = { code: 401, error: 'admin-token-invalid' };

function input(): HTMLInputElement {
  return document.querySelector('[data-testid="admin-token-input"] input, input[data-testid="admin-token-input"]')!;
}

async function type(value: string): Promise<void> {
  const el = input();
  el.value = value;
  el.dispatchEvent(new Event('input'));
  await flushPromises();
}

describe('AdminTokenDialog', () => {
  it('asks, lets the user retype after a wrong token, and retries until success', async () => {
    await mountWithApp(AdminTokenDialog);
    const session = useSessionStore();
    server.replyOnce(401, required);
    server.replyOnce(401, invalid);
    server.replyOnce(200, { code: 200, data: true });

    const op = session.withAdmin(() => deleteManga('m1'));
    await flushPromises();
    expect(document.body.textContent).toContain('需要管理员口令');
    expect(document.querySelector('[data-testid="admin-token-error"]')).toBeNull();

    await type('wrong');
    await click(findButton('确认'));
    await flushPromises();
    expect(server.requests[1].headers['X-Admin-Token']).toBe('wrong');
    expect(document.querySelector('[data-testid="admin-token-error"]')?.textContent).toContain(
      '管理员口令不正确',
    );
    expect(input().value).toBe('');

    await type('right');
    await click(findButton('确认'));
    await expect(op).resolves.toBe(true);
    expect(server.requests[2].headers['X-Admin-Token']).toBe('right');
    expect(session.adminToken).toBe('right');
  });

  it('cancel silently aborts the operation', async () => {
    await mountWithApp(AdminTokenDialog);
    const session = useSessionStore();
    server.reply(401, required);

    const op = session.withAdmin(() => deleteManga('m1'));
    const settled = op.catch((e) => e);
    await flushPromises();
    await click(findButton('取消'));
    const err = await settled;
    expect(err.error).toBe('admin-token-required');
    expect(server.requests).toHaveLength(1);
    expect(session.adminToken).toBeNull();
  });

  it('does not submit an empty token', async () => {
    await mountWithApp(AdminTokenDialog);
    const session = useSessionStore();
    server.reply(401, required);
    void session.withAdmin(() => deleteManga('m1')).catch(() => {});
    await flushPromises();
    expect(findButton('确认')?.disabled).toBe(true);
    await click(findButton('取消'));
  });

  it('does not invite the browser to save the token', async () => {
    await mountWithApp(AdminTokenDialog);
    const session = useSessionStore();
    server.reply(401, required);
    void session.withAdmin(() => deleteManga('m1')).catch(() => {});
    await flushPromises();
    const input = document.querySelector<HTMLInputElement>('[data-testid="admin-token-input"] input, input[data-testid="admin-token-input"]')!;
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.hasAttribute('name')).toBe(false);
    await click(findButton('取消'));
  });
});
