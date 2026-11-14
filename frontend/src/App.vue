<script setup lang="ts">
import { useRealtime } from '@/composables/useRealtime';

useRealtime();
</script>

<template>
  <UApp>
    <RouterView />
  </UApp>
</template>
