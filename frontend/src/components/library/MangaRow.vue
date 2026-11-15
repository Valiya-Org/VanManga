<script setup lang="ts">
import { computed } from 'vue';
import type { Manga } from '@/api/types';
import { useMangaStatus } from '@/composables/useMangaStatus';
import { useRelativeTime } from '@/composables/useRelativeTime';
import { isAutoUpdate, mangaUpdatedAt } from '@/api/manga';
import CoverImage from './CoverImage.vue';
import MangaActionsMenu from './MangaActionsMenu.vue';
import ProgressBar from '@/components/common/ProgressBar.vue';

const props = defineProps<{ manga: Manga }>();

const status = useMangaStatus(() => props.manga.manga_id);
const { relative } = useRelativeTime();
const autoUpdate = computed(() => isAutoUpdate(props.manga));
</script>

<template>
  <li
    class="flex items-center gap-3 border-b border-vm-divider px-1 py-2 last:border-b-0"
    :data-testid="`manga-row-${manga.manga_id}`"
  >
    <CoverImage :src="manga.thumbnail" :title="manga.manga_name" class="aspect-[3/4] w-11 shrink-0 rounded" />
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium" :title="manga.manga_name">{{ manga.manga_name }}</p>
      <div v-if="status.kind === 'downloading'" class="mt-1 flex items-center gap-2 text-xs text-vm-muted">
        <ProgressBar
          class="max-w-48"
          :done="status.progress?.done ?? 0"
          :total="status.progress?.total ?? null"
        />
        <span v-if="status.progress?.total" class="shrink-0">
          {{ status.progress.done }} / {{ status.progress.total }} 话
        </span>
      </div>
      <p v-else class="truncate text-xs text-vm-muted">
        {{ manga.artist_name }} ·
        <span v-if="manga.last_epi_name" class="text-vm-accent">{{ manga.last_epi_name }}</span>
        <span v-else>尚未下载</span>
        <template v-if="status.kind === 'queued'"> · 排队中 · 第 {{ status.position }} 位</template>
      </p>
    </div>
    <span class="hidden shrink-0 text-xs text-vm-muted sm:inline">{{ relative(mangaUpdatedAt(manga)) }}</span>
    <span
      class="shrink-0 rounded-full border px-2 py-0.5 text-xs"
      :class="autoUpdate ? 'border-vm-accent/50 text-vm-accent' : 'border-vm-divider text-vm-muted'"
    >
      {{ autoUpdate ? '自动' : '手动' }}
    </span>
    <MangaActionsMenu :manga="manga" />
  </li>
</template>
