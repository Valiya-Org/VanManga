<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** Completed amount; with `total` null/0 the bar is indeterminate. */
  done: number;
  total: number | null;
  label?: string;
}>();

const percent = computed(() =>
  props.total ? Math.min(100, Math.max(0, Math.round((props.done / props.total) * 100))) : null,
);
</script>

<template>
  <div
    class="h-1.5 w-full overflow-hidden rounded-full bg-white/15"
    role="progressbar"
    :aria-label="label ?? '下载进度'"
    aria-valuemin="0"
    :aria-valuemax="total ?? undefined"
    :aria-valuenow="percent === null ? undefined : done"
    data-testid="progress-bar"
  >
    <div
      class="vm-gradient-bg h-full rounded-full transition-[width] duration-300"
      :class="percent === null ? 'w-1/3 animate-pulse' : ''"
      :style="percent === null ? undefined : { width: `${percent}%` }"
    />
  </div>
</template>
