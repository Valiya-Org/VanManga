<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import { computed, reactive, ref, watch } from 'vue';
import type { SearchCandidate } from '@/api/types';
import type { MangaSearch } from '@/composables/useMangaSearch';
import { useIsMobile } from '@/composables/useIsMobile';
import { errorMessage } from '@/errors/messages';
import { useLibraryStore } from '@/stores/library';
import { useUiStore } from '@/stores/ui';
import SearchResultRow from './SearchResultRow.vue';

/**
 * Search results and "add to library". The search state is owned by the
 * shell (the top-bar input starts a search); this panel shows it and can
 * refine it. Closing cancels the search in flight.
 */
const props = defineProps<{ search: MangaSearch }>();

const library = useLibraryStore();
const ui = useUiStore();
const toast = useToast();
const mobile = useIsMobile();
const query = props.search.query;

const open = computed({
  get: () => ui.searchOpen,
  set: (value: boolean) => {
    ui.searchOpen = value;
  },
});

watch(open, (value) => {
  if (!value) props.search.cancel();
});

const adding = reactive(new Set<string>());
/** Reported as already in the library without a record to show. */
const knownInLibrary = reactive(new Set<string>());
const expired = ref(false);

watch(
  () => props.search.loading.value,
  (loading) => {
    if (loading) expired.value = false;
  },
);

const searched = computed(() => props.search.lastQuery.value !== null);
const noResults = computed(
  () =>
    searched.value &&
    !props.search.loading.value &&
    !props.search.error.value &&
    props.search.results.value.length === 0,
);

function inLibrary(c: SearchCandidate): boolean {
  return knownInLibrary.has(c.manga_id) || library.byId(c.manga_id) !== undefined;
}

function submit(): void {
  void props.search.search();
}

async function add(c: SearchCandidate): Promise<void> {
  adding.add(c.manga_id);
  try {
    const outcome = await library.add(c, {
      confirmDuplicate: (names) =>
        ui.confirm({
          title: '库中已有相似的漫画',
          description: `以下漫画与《${c.manga_name}》名字相近，仍然添加吗？`,
          items: names,
          confirmLabel: '仍然添加',
        }),
    });
    switch (outcome.status) {
      case 'added':
        toast.add({ title: `已添加《${outcome.manga.manga_name}》`, description: '已开始下载', color: 'success' });
        break;
      case 'already-in-library':
        knownInLibrary.add(c.manga_id);
        toast.add({ title: '这部漫画已在库中', color: 'info' });
        break;
      case 'search-expired':
        expired.value = true;
        break;
      case 'cancelled':
        break;
    }
  } catch (err) {
    const text = errorMessage(err);
    if (text) toast.add({ title: text, color: 'error' });
  } finally {
    adding.delete(c.manga_id);
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="搜索并添加漫画"
    :fullscreen="mobile"
    :close="false"
    :ui="{
      content: mobile
        ? 'bg-vm-surface'
        : 'bg-vm-surface ring-vm-divider top-20 -translate-y-0 max-w-3xl max-h-[calc(100dvh-6rem)]',
      header: 'gap-2 p-3 sm:px-4 min-h-0',
      wrapper: 'sr-only',
      body: 'p-0 sm:p-0',
    }"
  >
    <!-- The title stays (visually hidden) as the dialog's accessible name. -->
    <template #actions>
      <form class="flex flex-1 items-center gap-2" role="search" @submit.prevent="submit">
        <UInput
          v-model="query"
          icon="i-lucide-search"
          placeholder="搜索并添加漫画…"
          aria-label="搜索漫画"
          autofocus
          class="flex-1"
          data-testid="search-panel-input"
        />
      </form>
      <UButton color="neutral" variant="ghost" trailing-icon="i-lucide-x" @click="open = false">
        关闭
      </UButton>
    </template>

    <template #body>
      <div class="px-4 pb-3" data-testid="search-panel">
        <div
          v-if="expired"
          class="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-vm-divider bg-vm-card px-3 py-2 text-sm"
          role="alert"
          data-testid="search-expired"
        >
          <span class="flex-1">搜索结果已过期</span>
          <UButton size="sm" class="vm-gradient-btn" @click="search.research()">重新搜索</UButton>
        </div>

        <ul v-if="search.loading.value" aria-busy="true" aria-label="正在搜索">
          <li v-for="n in 5" :key="n" class="flex items-center gap-3 py-2.5">
            <USkeleton class="aspect-[3/4] w-12 rounded bg-vm-card" />
            <div class="flex-1 space-y-2">
              <USkeleton class="h-4 w-1/2 bg-vm-card" />
              <USkeleton class="h-3 w-1/3 bg-vm-card" />
            </div>
          </li>
        </ul>

        <div
          v-else-if="search.error.value"
          class="flex flex-col items-center gap-3 py-12 text-center"
          role="alert"
          data-testid="search-error"
        >
          <p class="text-vm-danger">{{ errorMessage(search.error.value) }}</p>
          <UButton color="neutral" variant="outline" @click="search.research()">重试</UButton>
        </div>

        <p v-else-if="noResults" class="py-12 text-center text-vm-muted" data-testid="search-empty">
          没有找到“{{ search.lastQuery.value }}”相关的漫画
        </p>

        <p v-else-if="!searched" class="py-12 text-center text-vm-muted">输入关键词后按回车搜索</p>

        <ul v-else>
          <SearchResultRow
            v-for="c in search.results.value"
            :key="c.manga_id"
            :candidate="c"
            :in-library="inLibrary(c)"
            :adding="adding.has(c.manga_id)"
            @add="add(c)"
          />
        </ul>
      </div>
    </template>
  </UModal>
</template>
