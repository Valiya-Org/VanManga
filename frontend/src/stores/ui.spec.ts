import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from './ui';

beforeEach(() => setActivePinia(createPinia()));

describe('ui store', () => {
  it('confirm resolves with the answer and closes', async () => {
    const ui = useUiStore();
    const answer = ui.confirm({ title: 'T', confirmLabel: 'OK' });
    expect(ui.pendingConfirm?.title).toBe('T');
    ui.answerConfirm(true);
    await expect(answer).resolves.toBe(true);
    expect(ui.pendingConfirm).toBeNull();
  });

  it('a newer confirm cancels the open one', async () => {
    const ui = useUiStore();
    const first = ui.confirm({ title: 'A', confirmLabel: 'OK' });
    const second = ui.confirm({ title: 'B', confirmLabel: 'OK' });
    await expect(first).resolves.toBe(false);
    expect(ui.pendingConfirm?.title).toBe('B');
    ui.answerConfirm(false);
    await expect(second).resolves.toBe(false);
    expect(ui.pendingConfirm).toBeNull();
  });

  it('opens and closes the chapter picker', () => {
    const ui = useUiStore();
    ui.openChapterPicker('m1');
    expect(ui.chapterPickerFor).toBe('m1');
    ui.closeChapterPicker();
    expect(ui.chapterPickerFor).toBeNull();
  });
});
