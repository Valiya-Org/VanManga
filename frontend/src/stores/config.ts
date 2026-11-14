import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getConfig } from '@/api/endpoints';
import { toApiError } from '@/api/http';
import type { ApiError } from '@/api/errors';
import type { RuntimeConfig } from '@/api/types';

/** Runtime configuration from `GET /api/config`. */
export const useConfigStore = defineStore('config', () => {
  const config = ref<RuntimeConfig | null>(null);
  const loading = ref(false);
  const error = ref<ApiError | null>(null);

  const kavitaEnabled = computed(() => config.value?.kavitaEnabled ?? false);
  const kavitaExposeUrl = computed(() => config.value?.kavitaExposeUrl ?? null);
  const adminRequired = computed(() => config.value?.adminRequired ?? false);

  /** Loads the config. Never throws; failures land in `error`. */
  async function load(): Promise<void> {
    loading.value = true;
    try {
      config.value = await getConfig();
      error.value = null;
    } catch (err) {
      error.value = toApiError(err);
    } finally {
      loading.value = false;
    }
  }

  return { config, loading, error, kavitaEnabled, kavitaExposeUrl, adminRequired, load };
});
