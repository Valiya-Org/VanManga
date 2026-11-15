import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ConfirmRequest {
  title: string;
  description?: string;
  /** Optional bullet list under the description (e.g. similar titles). */
  items?: string[];
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive action: the confirm button uses the danger colour. */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

/**
 * Open/closed state of the app-wide overlays. Components flip these flags;
 * AppShell mounts the overlays once.
 */
export const useUiStore = defineStore('ui', () => {
  const searchOpen = ref(false);
  const queueOpen = ref(false);
  /** manga_id whose chapter picker is open, or null. */
  const chapterPickerFor = ref<string | null>(null);
  /** The confirmation dialog currently shown, or null. */
  const pendingConfirm = ref<PendingConfirm | null>(null);

  /** Shows the confirm dialog; resolves true on confirm, false otherwise.
   *  A newer request cancels (resolves false) the one still open. */
  function confirm(request: ConfirmRequest): Promise<boolean> {
    pendingConfirm.value?.resolve(false);
    return new Promise<boolean>((resolve) => {
      const settle = (ok: boolean): void => {
        // Only clear the dialog if it is still this request's.
        if (pendingConfirm.value?.resolve === settle) pendingConfirm.value = null;
        resolve(ok);
      };
      pendingConfirm.value = { ...request, resolve: settle };
    });
  }

  function answerConfirm(ok: boolean): void {
    pendingConfirm.value?.resolve(ok);
  }

  function openChapterPicker(mangaId: string): void {
    chapterPickerFor.value = mangaId;
  }

  function closeChapterPicker(): void {
    chapterPickerFor.value = null;
  }

  return {
    searchOpen,
    queueOpen,
    chapterPickerFor,
    pendingConfirm,
    confirm,
    answerConfirm,
    openChapterPicker,
    closeChapterPicker,
  };
});
