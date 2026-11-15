<script setup lang="ts">
import { zh_cn } from '@nuxt/ui/locale';
import { useRealtime } from '@/composables/useRealtime';
import AppShell from '@/layouts/AppShell.vue';

// Loads config, library and queue over HTTP, then connects the socket once.
useRealtime();
</script>

<template>
  <UApp :locale="zh_cn" :toaster="{ position: 'top-center' }">
    <AppShell>
      <RouterView />
    </AppShell>
  </UApp>
</template>
