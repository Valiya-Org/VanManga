<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{ src: string; title: string }>();

const failed = ref(false);
watch(
  () => props.src,
  () => (failed.value = false),
);

const initial = computed(() => Array.from(props.title.trim())[0] ?? '?');
</script>

<template>
  <div class="relative overflow-hidden bg-vm-divider">
    <img
      v-if="!failed"
      :src="src"
      :alt="`《${title}》封面`"
      loading="lazy"
      decoding="async"
      class="h-full w-full object-cover"
      data-testid="cover-img"
      @error="failed = true"
    />
    <div
      v-else
      class="flex h-full w-full items-center justify-center text-2xl font-bold text-vm-muted"
      aria-hidden="true"
      data-testid="cover-fallback"
    >
      {{ initial }}
    </div>
  </div>
</template>
