<script setup lang="ts">
import { computed } from 'vue';
import type { TaskSummary } from '@/api/types';
import { useLibraryStore } from '@/stores/library';
import { useQueueStore } from '@/stores/queue';
import { useRealtimeStore } from '@/stores/realtime';
import ProgressBar from '@/components/common/ProgressBar.vue';

/** Read-only view of the download queue (no cancel/reorder API exists). */
const queue = useQueueStore();
const library = useLibraryStore();
const realtime = useRealtimeStore();

function title(task: TaskSummary): string {
  if (task.kind === 'rezip') return '重新打包全部漫画';
  const manga = task.mangaId ? library.byId(task.mangaId) : undefined;
  return manga?.manga_name ?? task.mangaId ?? '未知漫画';
}

function scope(task: TaskSummary): string {
  switch (task.kind) {
    case 'full-manga':
      return '下载全部新章节';
    case 'redownload':
      return '重新下载所选章节';
    case 'rezip':
      return '整理下载目录';
  }
}

const active = computed(() => queue.active);
const progress = computed(() => queue.activeProgress);
const current = computed(() => {
  const id = active.value?.mangaId;
  return id ? (library.byId(id)?.last_epi_name ?? '') : '';
});
const position = computed(() => {
  const p = progress.value;
  if (!p?.total) return null;
  return { at: Math.min(p.done + 1, p.total), total: p.total };
});

const connection = computed(() => {
  if (realtime.connected) return { dot: 'bg-emerald-400', text: '实时连接正常' };
  if (realtime.offline) return { dot: 'bg-vm-danger', text: '实时连接已断开，正在重连…' };
  return { dot: 'bg-amber-400', text: '正在连接…' };
});
</script>

<template>
  <div class="flex h-full flex-col" data-testid="queue-content">
    <div class="flex-1 space-y-5 overflow-y-auto">
      <p
        v-if="!active && queue.pending.length === 0"
        class="py-12 text-center text-vm-muted"
        data-testid="queue-empty"
      >
        当前没有下载任务
      </p>

      <section v-if="active" aria-labelledby="queue-active-heading" data-testid="queue-active">
        <h3 id="queue-active-heading" class="mb-2 text-xs font-medium text-vm-muted">正在下载</h3>
        <div class="space-y-2 rounded-lg bg-vm-card p-3">
          <p class="truncate font-medium" :title="title(active)">{{ title(active) }}</p>
          <p class="truncate text-xs text-vm-muted">
            <template v-if="position">第 {{ position.at }} / {{ position.total }} 话</template>
            <template v-else>{{ scope(active) }}</template>
            <template v-if="current">
              · 当前：<span class="text-vm-accent">{{ current }}</span>
            </template>
          </p>
          <ProgressBar
            v-if="active.kind !== 'rezip'"
            :done="progress?.done ?? 0"
            :total="progress?.total ?? null"
          />
        </div>
      </section>

      <section v-if="queue.pending.length" aria-labelledby="queue-pending-heading" data-testid="queue-pending">
        <h3 id="queue-pending-heading" class="mb-2 text-xs font-medium text-vm-muted">
          等待中 · {{ queue.pending.length }}
        </h3>
        <ol class="divide-y divide-vm-divider rounded-lg bg-vm-card">
          <li v-for="(task, i) in queue.pending" :key="task.id" class="flex items-center gap-3 px-3 py-2.5">
            <span class="w-5 shrink-0 text-center text-xs text-vm-muted">{{ i + 1 }}</span>
            <div class="min-w-0">
              <p class="truncate text-sm" :title="title(task)">{{ title(task) }}</p>
              <p class="text-xs text-vm-muted">{{ scope(task) }}</p>
            </div>
          </li>
        </ol>
      </section>
    </div>

    <p
      class="mt-4 flex items-center gap-2 border-t border-vm-divider pt-3 text-xs text-vm-muted"
      data-testid="queue-connection"
    >
      <span class="size-2 shrink-0 rounded-full" :class="connection.dot" aria-hidden="true" />
      {{ connection.text }}
    </p>
  </div>
</template>
