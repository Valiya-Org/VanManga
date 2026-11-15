<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Chapter } from '@/api/types';
import type { ApiError } from '@/api/errors';
import { toApiError } from '@/api/http';
import { errorMessage } from '@/errors/messages';
import { useLibraryStore } from '@/stores/library';
import { useUiStore } from '@/stores/ui';

/** Pick source chapters of `ui.chapterPickerFor` to download again. */
const ui = useUiStore();
const library = useLibraryStore();
const toast = useToast();

const mangaId = computed(() => ui.chapterPickerFor);
const manga = computed(() => (mangaId.value ? library.byId(mangaId.value) : undefined));

const chapters = ref<Chapter[]>([]);
const selected = ref(new Set<number>());
const loading = ref(false);
const error = ref<ApiError | null>(null);
const submitting = ref(false);
let loadSeq = 0;

async function load(): Promise<void> {
  const id = mangaId.value;
  if (!id) return;
  const seq = ++loadSeq;
  loading.value = true;
  error.value = null;
  chapters.value = [];
  selected.value = new Set();
  try {
    const list = await library.fetchChapters(id);
    if (seq === loadSeq) chapters.value = list;
  } catch (err) {
    if (seq === loadSeq) error.value = toApiError(err);
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

watch(mangaId, (id) => {
  if (id) void load();
  else loadSeq++;
}, { immediate: true });

const open = computed({
  get: () => mangaId.value !== null,
  set: (value: boolean) => {
    if (!value) ui.closeChapterPicker();
  },
});

function toggle(index: number): void {
  const next = new Set(selected.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  selected.value = next;
}

function selectAll(): void {
  selected.value = new Set(chapters.value.map((c) => c.index));
}

function invert(): void {
  selected.value = new Set(chapters.value.filter((c) => !selected.value.has(c.index)).map((c) => c.index));
}

const count = computed(() => selected.value.size);

async function confirm(): Promise<void> {
  const id = mangaId.value;
  if (!id || count.value === 0) return;
  const picked = chapters.value.filter((c) => selected.value.has(c.index));
  submitting.value = true;
  try {
    await library.redownload(id, picked);
    toast.add({ title: `已加入下载队列：${picked.length} 话`, description: manga.value?.manga_name, color: 'success' });
    ui.closeChapterPicker();
  } catch (err) {
    const text = errorMessage(err);
    if (text) toast.add({ title: text, color: 'error' });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`《${manga?.manga_name ?? mangaId ?? ''}》· 选择章节`"
    description="选择要重新下载的章节"
    :ui="{
      content: 'bg-vm-surface ring-vm-divider sm:max-w-2xl',
      description: 'sr-only',
      footer: 'justify-between gap-2 flex-wrap',
    }"
  >
    <template #body>
      <div data-testid="chapter-picker">
        <div v-if="loading" class="flex flex-wrap gap-2" aria-busy="true" aria-label="正在加载章节">
          <USkeleton v-for="n in 18" :key="n" class="h-8 w-20 rounded-full bg-vm-card" />
        </div>
        <div
          v-else-if="error"
          class="flex flex-col items-center gap-3 py-8 text-center"
          role="alert"
          data-testid="chapter-error"
        >
          <p class="text-vm-danger">{{ errorMessage(error) }}</p>
          <UButton color="neutral" variant="outline" @click="load()">重试</UButton>
        </div>
        <p v-else-if="chapters.length === 0" class="py-8 text-center text-vm-muted">源站没有章节</p>
        <div v-else class="flex max-h-[50dvh] flex-wrap gap-2 overflow-y-auto" role="group" aria-label="章节">
          <button
            v-for="c in chapters"
            :key="c.index"
            type="button"
            class="max-w-full truncate rounded-full border px-3 py-1 text-sm transition-colors"
            :class="
              selected.has(c.index)
                ? 'border-transparent bg-violet-500/25 text-vm-accent'
                : 'border-vm-divider text-vm-text hover:border-vm-muted'
            "
            :aria-pressed="selected.has(c.index)"
            :title="c.title"
            data-testid="chapter-chip"
            @click="toggle(c.index)"
          >
            {{ c.title }}
          </button>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex items-center gap-2 text-sm">
        <UButton color="neutral" variant="ghost" size="sm" :disabled="!chapters.length" @click="selectAll">
          全选
        </UButton>
        <UButton color="neutral" variant="ghost" size="sm" :disabled="!chapters.length" @click="invert">
          反选
        </UButton>
        <span class="text-vm-muted" data-testid="chapter-count">已选 {{ count }} / {{ chapters.length }}</span>
      </div>
      <UButton
        class="vm-gradient-btn"
        :disabled="count === 0 || submitting"
        :loading="submitting"
        data-testid="chapter-confirm"
        @click="confirm"
      >
        重新下载 {{ count }} 话
      </UButton>
    </template>
  </UModal>
</template>
