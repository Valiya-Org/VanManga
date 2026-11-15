<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useUiStore, type ConfirmRequest } from '@/stores/ui';

/** The single app-wide confirmation dialog, driven by `ui.confirm()`. */
const ui = useUiStore();

// The last request stays rendered after it is answered, so the dialog does
// not go blank during its leave transition; the next request replaces it.
const request = ref<ConfirmRequest | null>(ui.pendingConfirm);
watch(
  () => ui.pendingConfirm,
  (next) => {
    if (next) request.value = next;
  },
);

const open = computed({
  get: () => ui.pendingConfirm !== null,
  set: (value: boolean) => {
    if (!value) ui.answerConfirm(false);
  },
});
</script>

<template>
  <UModal
    v-model:open="open"
    :title="request?.title ?? ''"
    :description="request?.description"
    :close="false"
    :ui="{ content: 'bg-vm-surface ring-vm-divider', footer: 'justify-end' }"
  >
    <template v-if="request?.items?.length" #body>
      <ul class="list-disc space-y-1 pl-5 text-sm" data-testid="confirm-items">
        <li v-for="item in request.items" :key="item" class="text-vm-accent">{{ item }}</li>
      </ul>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="ui.answerConfirm(false)">
        {{ request?.cancelLabel ?? '取消' }}
      </UButton>
      <UButton
        v-if="request?.danger"
        class="bg-vm-danger text-vm-bg hover:bg-vm-danger/85"
        data-testid="confirm-ok"
        @click="ui.answerConfirm(true)"
      >
        {{ request?.confirmLabel }}
      </UButton>
      <UButton v-else class="vm-gradient-btn" data-testid="confirm-ok" @click="ui.answerConfirm(true)">
        {{ request?.confirmLabel }}
      </UButton>
    </template>
  </UModal>
</template>
