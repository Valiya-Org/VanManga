<script setup lang="ts">
import { computed } from 'vue';
import { useLibraryStore } from '@/stores/library';
import { errorMessage } from '@/errors/messages';
import { useLibraryViewMode } from '@/composables/useLibraryViewMode';
import LibraryToolbar from '@/components/library/LibraryToolbar.vue';
import MangaCard from '@/components/library/MangaCard.vue';
import MangaRow from '@/components/library/MangaRow.vue';

const library = useLibraryStore();
const mode = useLibraryViewMode();

const filter = computed({
  get: () => library.filter,
  set: (v: string) => (library.filter = v),
});

const firstLoad = computed(() => !library.loaded && library.loading);
const failed = computed(() => library.loadError !== null);
const empty = computed(() => library.loaded && library.items.length === 0);
const noMatch = computed(() => library.items.length > 0 && library.visible.length === 0);
</script>

<template>
  <main class="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 sm:px-6" data-testid="library-view">
    <LibraryToolbar v-model:filter="filter" v-model:mode="mode" :total="library.items.length" />

    <div
      v-if="failed"
      class="flex flex-wrap items-center gap-3 rounded-lg border border-vm-danger/40 bg-vm-card px-4 py-3 text-sm"
      role="alert"
      data-testid="library-error"
    >
      <UIcon name="i-lucide-circle-alert" class="size-5 shrink-0 text-vm-danger" />
      <span class="flex-1">漫画库加载失败：{{ errorMessage(library.loadError) }}</span>
      <UButton size="sm" color="neutral" variant="outline" :loading="library.loading" @click="library.load()">
        重试
      </UButton>
    </div>

    <div
      v-if="firstLoad"
      class="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"
      aria-busy="true"
      aria-label="正在加载漫画库"
    >
      <USkeleton v-for="n in 12" :key="n" class="aspect-[3/4] rounded-lg bg-vm-card" />
    </div>

    <p v-else-if="empty && !failed" class="py-16 text-center text-vm-muted" data-testid="library-empty">
      还没有漫画，在上方搜索并添加
    </p>
    <p v-else-if="noMatch" class="py-16 text-center text-vm-muted" data-testid="library-no-match">
      没有匹配的漫画
    </p>

    <div
      v-else-if="mode === 'cards'"
      class="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"
      data-testid="library-grid"
    >
      <MangaCard v-for="m in library.visible" :key="m.manga_id" :manga="m" />
    </div>

    <ul v-else class="rounded-lg bg-vm-card px-3" data-testid="library-list">
      <MangaRow v-for="m in library.visible" :key="m.manga_id" :manga="m" />
    </ul>
  </main>
</template>
