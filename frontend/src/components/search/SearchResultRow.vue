<script setup lang="ts">
import type { SearchCandidate } from '@/api/types';
import CoverImage from '@/components/library/CoverImage.vue';

defineProps<{
  candidate: SearchCandidate;
  inLibrary: boolean;
  adding: boolean;
}>();
const emit = defineEmits<{ add: [] }>();
</script>

<template>
  <li
    class="flex items-center gap-3 border-b border-vm-divider py-2.5 last:border-b-0"
    :data-testid="`search-result-${candidate.manga_id}`"
  >
    <CoverImage
      :src="candidate.thumbnail"
      :title="candidate.manga_name"
      class="aspect-[3/4] w-12 shrink-0 rounded"
    />
    <div class="min-w-0 flex-1">
      <p class="truncate font-medium" :title="candidate.manga_name">{{ candidate.manga_name }}</p>
      <p class="truncate text-xs text-vm-muted">
        {{ candidate.artist_name || '未知作者' }} ·
        <span class="text-vm-accent">{{ candidate.newest_epi }}</span>
      </p>
    </div>
    <UButton
      v-if="inLibrary"
      disabled
      color="neutral"
      variant="outline"
      size="sm"
      class="shrink-0"
      icon="i-lucide-check"
    >
      已在库中
    </UButton>
    <UButton
      v-else
      size="sm"
      class="vm-gradient-btn shrink-0"
      :loading="adding"
      :disabled="adding"
      icon="i-lucide-plus"
      :aria-label="`添加《${candidate.manga_name}》`"
      @click="emit('add')"
    >
      添加
    </UButton>
  </li>
</template>
