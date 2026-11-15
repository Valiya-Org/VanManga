<script setup lang="ts">
import { computed } from 'vue';
import type { DropdownMenuItem } from '@nuxt/ui';
import type { Manga } from '@/api/types';
import { BUSY_REASON, useMangaActions } from '@/composables/useMangaActions';

const props = defineProps<{ manga: Manga }>();

const actions = useMangaActions(() => props.manga);

const items = computed<DropdownMenuItem[][]>(() => {
  const busy = actions.busy.value;
  const main: DropdownMenuItem[] = [
    {
      label: actions.autoUpdate.value ? '关闭自动更新' : '开启自动更新',
      icon: actions.autoUpdate.value ? 'i-lucide-pause' : 'i-lucide-refresh-cw',
      onSelect: () => void actions.toggleAutoUpdate(),
    },
    {
      label: '选择章节重新下载',
      icon: 'i-lucide-list-checks',
      disabled: busy,
      description: busy ? BUSY_REASON : undefined,
      onSelect: () => actions.chooseChapters(),
    },
  ];
  if (actions.kavitaUrl.value) {
    main.push({
      label: '在 Kavita 中打开',
      icon: 'i-lucide-external-link',
      onSelect: () => actions.openInKavita(),
    });
  }
  return [
    main,
    [
      {
        label: '删除',
        icon: 'i-lucide-trash-2',
        class: 'text-vm-danger data-highlighted:text-vm-danger',
        ui: { itemLeadingIcon: 'text-vm-danger group-data-highlighted:text-vm-danger' },
        disabled: busy,
        description: busy ? BUSY_REASON : undefined,
        onSelect: () => void actions.remove(),
      },
    ],
  ];
});
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end' }"
    :ui="{ content: 'bg-vm-surface ring-vm-divider w-60' }"
  >
    <UButton
      icon="i-lucide-ellipsis"
      color="neutral"
      variant="ghost"
      size="sm"
      :aria-label="`《${manga.manga_name}》的操作`"
      data-testid="manga-actions"
    />
  </UDropdownMenu>
</template>
