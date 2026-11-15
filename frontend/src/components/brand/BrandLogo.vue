<script setup lang="ts">
import mark from '@/assets/valiya-mark.png';
</script>

<template>
  <RouterLink
    to="/"
    class="flex shrink-0 items-center gap-2 rounded-full select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary)"
    aria-label="VanManga 首页"
    data-testid="brand-logo"
  >
    <img :src="mark" alt="" class="h-7 w-auto" width="24" height="28" />
    <span class="text-lg font-bold tracking-tight">
      <span class="text-white">Van</span><span class="vm-gradient-text">Manga</span>
    </span>
  </RouterLink>
</template>
