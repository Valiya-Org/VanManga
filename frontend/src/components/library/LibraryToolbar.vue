<script setup lang="ts">
import type { LibraryViewMode } from '@/composables/useLibraryViewMode';

defineProps<{ total: number }>();
const filter = defineModel<string>('filter', { required: true });
const mode = defineModel<LibraryViewMode>('mode', { required: true });
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="library-toolbar">
    <p class="shrink-0 text-sm text-vm-muted">共 {{ total }} 部 · 按最近更新</p>
    <UInput
      v-model="filter"
      icon="i-lucide-filter"
      placeholder="在库中筛选…"
      aria-label="在库中筛选"
      class="order-last w-full sm:order-none sm:w-auto sm:max-w-72 sm:flex-1"
      data-testid="library-filter"
    />
    <div
      class="ml-auto flex shrink-0 rounded-full bg-vm-card p-0.5 text-sm"
      role="group"
      aria-label="显示方式"
    >
      <button
        type="button"
        class="rounded-full px-3 py-1 transition-colors"
        :class="mode === 'cards' ? 'bg-vm-divider text-vm-text' : 'text-vm-muted hover:text-vm-text'"
        :aria-pressed="mode === 'cards'"
        @click="mode = 'cards'"
      >
        卡片
      </button>
      <button
        type="button"
        class="rounded-full px-3 py-1 transition-colors"
        :class="mode === 'list' ? 'bg-vm-divider text-vm-text' : 'text-vm-muted hover:text-vm-text'"
        :aria-pressed="mode === 'list'"
        @click="mode = 'list'"
      >
        列表
      </button>
    </div>
  </div>
</template>
