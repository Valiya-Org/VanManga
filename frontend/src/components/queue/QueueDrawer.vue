<script setup lang="ts">
import { computed } from 'vue';
import { useUiStore } from '@/stores/ui';
import { useQueueStore } from '@/stores/queue';
import QueueContent from './QueueContent.vue';

/** Desktop: right-hand drawer (~360px). Phone: full-screen page. */
const ui = useUiStore();
const queue = useQueueStore();

const open = computed({
  get: () => ui.queueOpen,
  set: (value: boolean) => (ui.queueOpen = value),
});
</script>

<template>
  <USlideover
    v-model:open="open"
    side="right"
    :title="`下载队列${queue.count ? ` · ${queue.count}` : ''}`"
    description="只读：显示正在下载与等待中的任务"
    :ui="{
      content: 'bg-vm-surface w-full max-w-none md:max-w-[360px] ring-vm-divider',
      description: 'sr-only',
      body: 'flex flex-col',
    }"
  >
    <template #body>
      <QueueContent class="flex-1" />
    </template>
  </USlideover>
</template>
