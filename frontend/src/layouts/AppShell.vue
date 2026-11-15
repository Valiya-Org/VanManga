<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import { watch } from 'vue';
import { useMangaSearch } from '@/composables/useMangaSearch';
import { useLibraryStore } from '@/stores/library';
import { useQueueStore } from '@/stores/queue';
import { useRealtimeStore } from '@/stores/realtime';
import { useUiStore } from '@/stores/ui';
import BrandLogo from '@/components/brand/BrandLogo.vue';
import SearchPanel from '@/components/search/SearchPanel.vue';
import QueueDrawer from '@/components/queue/QueueDrawer.vue';
import ChapterPickerDialog from '@/components/chapters/ChapterPickerDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import AdminTokenDialog from '@/components/common/AdminTokenDialog.vue';

/**
 * App frame: top bar (logo, search, queue, settings), phone bottom tabs,
 * the realtime-offline notice, and every overlay, mounted once.
 */
const ui = useUiStore();
const queue = useQueueStore();
const library = useLibraryStore();
const realtime = useRealtimeStore();
const toast = useToast();

const search = useMangaSearch();
const query = search.query;

function submitSearch(): void {
  if (!query.value.trim()) return;
  ui.searchOpen = true;
  void search.search();
}

// Server-side events worth telling the user about.
watch(
  () => library.dmcaAlerts.length,
  () => {
    for (const alert of [...library.dmcaAlerts]) {
      toast.add({
        title: `《${alert.manga_name}》已因 DMCA 被源站下架`,
        description: '已从漫画库中移除',
        color: 'warning',
        duration: 0,
      });
      library.dismissDmcaAlert(alert.manga_id);
    }
  },
  { immediate: true },
);

watch(
  () => queue.lastCompleted,
  (event) => {
    if (event?.status !== 'failed') return;
    const name = event.manga?.manga_name ?? library.byId(event.manga_id)?.manga_name ?? event.manga_id;
    toast.add({ title: `《${name}》下载失败`, color: 'error' });
  },
);

watch(
  () => queue.lastScanCompletedAt,
  (at) => {
    if (at) toast.add({ title: '重新打包完成', color: 'success' });
  },
);
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-40 border-b border-vm-divider bg-vm-surface">
      <div class="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <BrandLogo />
        <form class="min-w-0 flex-1" role="search" @submit.prevent="submitSearch">
          <UInput
            v-model="query"
            icon="i-lucide-search"
            placeholder="搜索并添加漫画…"
            aria-label="搜索并添加漫画"
            enterkeyhint="search"
            class="w-full"
            :ui="{ base: 'bg-vm-card' }"
            data-testid="topbar-search"
          />
        </form>
        <UButton
          v-if="queue.count > 0"
          class="vm-gradient-btn hidden shrink-0 md:inline-flex"
          icon="i-lucide-download"
          :aria-label="`下载队列，${queue.count} 个任务`"
          data-testid="queue-button"
          @click="ui.queueOpen = true"
        >
          队列 {{ queue.count }}
        </UButton>
        <UButton
          v-else
          class="hidden shrink-0 md:inline-flex"
          color="neutral"
          variant="outline"
          icon="i-lucide-download"
          aria-label="下载队列"
          data-testid="queue-button"
          @click="ui.queueOpen = true"
        >
          队列
        </UButton>
        <UButton
          to="/settings"
          class="hidden shrink-0 md:inline-flex"
          color="neutral"
          variant="ghost"
          icon="i-lucide-settings"
          aria-label="设置"
          data-testid="settings-link"
        />
      </div>
      <p
        v-if="realtime.offline"
        class="border-t border-vm-divider bg-vm-card px-4 py-1 text-center text-xs text-vm-muted"
        role="status"
        data-testid="offline-notice"
      >
        实时连接已断开，正在重连…
      </p>
    </header>

    <div class="flex-1 pb-16 md:pb-0">
      <slot />
    </div>

    <nav
      class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-vm-divider bg-vm-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="主导航"
      data-testid="bottom-tabs"
    >
      <RouterLink
        to="/"
        class="flex flex-col items-center gap-0.5 py-2 text-xs text-vm-muted"
        exact-active-class="!text-vm-text"
      >
        <UIcon name="i-lucide-library" class="size-5" />
        漫画库
      </RouterLink>
      <button
        type="button"
        class="flex flex-col items-center gap-0.5 py-2 text-xs"
        :class="ui.queueOpen ? 'text-vm-text' : 'text-vm-muted'"
        data-testid="queue-tab"
        @click="ui.queueOpen = true"
      >
        <span class="relative">
          <UIcon name="i-lucide-download" class="size-5" />
          <span
            v-if="queue.count > 0"
            class="absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-vm-accent px-1 text-[10px] font-medium leading-4 text-vm-bg"
            data-testid="queue-tab-badge"
          >{{ queue.count }}</span>
        </span>
        队列
      </button>
      <RouterLink
        to="/settings"
        class="flex flex-col items-center gap-0.5 py-2 text-xs text-vm-muted"
        exact-active-class="!text-vm-text"
      >
        <UIcon name="i-lucide-settings" class="size-5" />
        设置
      </RouterLink>
    </nav>

    <SearchPanel :search="search" />
    <QueueDrawer />
    <ChapterPickerDialog />
    <ConfirmDialog />
    <AdminTokenDialog />
  </div>
</template>
