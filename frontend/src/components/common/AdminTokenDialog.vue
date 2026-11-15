<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useSessionStore, type AdminTokenRequest } from '@/stores/session';
import { ERROR_MESSAGES } from '@/errors/messages';

/**
 * Global admin-token prompt registered with `session.setAdminTokenPrompt`.
 * Confirm hands the token to `withAdmin`, which retries; a wrong token asks
 * again with reason `admin-token-invalid`, shown inside the dialog. Cancel
 * resolves null, which silently aborts the operation. The token only lives
 * in memory (the session store).
 */
const session = useSessionStore();

const pending = ref<{ reason: AdminTokenRequest['reason']; resolve: (t: string | null) => void } | null>(
  null,
);
const token = ref('');

function ask(req: AdminTokenRequest): Promise<string | null> {
  return new Promise((resolve) => {
    pending.value?.resolve(null);
    token.value = '';
    pending.value = { reason: req.reason, resolve };
  });
}

function answer(value: string | null): void {
  const current = pending.value;
  pending.value = null;
  current?.resolve(value);
}

function submit(): void {
  const value = token.value.trim();
  if (value) answer(value);
}

const open = computed({
  get: () => pending.value !== null,
  set: (value: boolean) => {
    if (!value) answer(null);
  },
});

const invalid = computed(() => pending.value?.reason === 'admin-token-invalid');

onMounted(() => session.setAdminTokenPrompt(ask));
onUnmounted(() => {
  session.setAdminTokenPrompt(null);
  answer(null);
});
</script>

<template>
  <UModal
    v-model:open="open"
    title="需要管理员口令"
    description="此操作受管理员口令保护。口令只保存在本页面内存中，刷新后需要重新输入。"
    :ui="{ content: 'bg-vm-surface ring-vm-divider', footer: 'justify-end' }"
  >
    <template #body>
      <form id="admin-token-form" class="space-y-2" @submit.prevent="submit">
        <UInput
          v-model="token"
          type="password"
          placeholder="管理员口令"
          autocomplete="one-time-code"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          autofocus
          class="w-full"
          :color="invalid ? 'error' : undefined"
          :highlight="invalid"
          aria-label="管理员口令"
          data-testid="admin-token-input"
        />
        <p v-if="invalid" class="text-vm-danger text-sm" role="alert" data-testid="admin-token-error">
          {{ ERROR_MESSAGES['admin-token-invalid'] }}，请重新输入
        </p>
      </form>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="answer(null)">取消</UButton>
      <UButton
        type="submit"
        form="admin-token-form"
        class="vm-gradient-btn"
        :disabled="!token.trim()"
        data-testid="admin-token-submit"
      >
        确认
      </UButton>
    </template>
  </UModal>
</template>
