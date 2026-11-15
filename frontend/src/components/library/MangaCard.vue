<script setup lang="ts">
import { computed } from 'vue';
import type { Manga } from '@/api/types';
import { useMangaStatus } from '@/composables/useMangaStatus';
import { useRelativeTime } from '@/composables/useRelativeTime';
import { isRecentlyUpdated, mangaUpdatedAt } from './manga-display';
import CoverImage from './CoverImage.vue';
import MangaActionsMenu from './MangaActionsMenu.vue';
import ProgressBar from '@/components/common/ProgressBar.vue';

const props = defineProps<{ manga: Manga }>();

const status = useMangaStatus(() => props.manga.manga_id);
const { now, relative } = useRelativeTime();

const isNew = computed(() => isRecentlyUpdated(props.manga, now.value));
const autoUpdate = computed(() => props.manga.download_switch === 0);
const downloaded = computed(() => props.manga.last_epi_name !== '');
</script>

<template>
  <article
    class="flex min-w-0 flex-col overflow-hidden rounded-lg bg-vm-card"
    :data-testid="`manga-card-${manga.manga_id}`"
  >
    <div class="relative aspect-[3/4]">
      <CoverImage :src="manga.thumbnail" :title="manga.manga_name" class="h-full w-full" />
      <span
        v-if="isNew"
        class="vm-gradient-bg absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
        data-testid="badge-new"
      >新</span>
      <span
        v-if="autoUpdate"
        class="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-vm-text backdrop-blur-sm"
        title="自动更新已开启"
        data-testid="badge-auto"
      >自动</span>
      <div
        v-if="status.kind !== 'idle'"
        class="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/85 to-transparent px-2 pt-6 pb-2 text-xs text-white"
        data-testid="card-overlay"
      >
        <template v-if="status.kind === 'downloading'">
          <p>
            下载中<template v-if="status.progress?.total">
              {{ status.progress.done }} / {{ status.progress.total }} 话</template>
          </p>
          <ProgressBar :done="status.progress?.done ?? 0" :total="status.progress?.total ?? null" />
        </template>
        <p v-else>排队中 · 第 {{ status.position }} 位</p>
      </div>
    </div>
    <div class="flex min-w-0 flex-1 flex-col gap-0.5 p-2.5">
      <h3 class="truncate text-sm font-medium text-vm-text" :title="manga.manga_name">
        {{ manga.manga_name }}
      </h3>
      <p v-if="downloaded" class="truncate text-xs text-vm-accent" :title="manga.last_epi_name">
        {{ manga.last_epi_name }}
      </p>
      <p v-else class="text-xs text-vm-muted">尚未下载</p>
      <div class="mt-auto flex items-center justify-between gap-1">
        <span class="truncate text-xs text-vm-muted">{{ relative(mangaUpdatedAt(manga)) }}</span>
        <MangaActionsMenu :manga="manga" class="-mr-1.5" />
      </div>
    </div>
  </article>
</template>
