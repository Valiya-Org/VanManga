<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import { ref } from 'vue';
import { isApiError } from '@/api/errors';
import { errorMessage } from '@/errors/messages';
import { useConfigStore } from '@/stores/config';
import { useLibraryStore } from '@/stores/library';
import { useSessionStore } from '@/stores/session';
import { useUiStore } from '@/stores/ui';
import { openExternal } from '@/utils/open-external';
import valiyaLogo from '@/assets/valiya-logo.png';

const config = useConfigStore();
const session = useSessionStore();
const library = useLibraryStore();
const ui = useUiStore();
const toast = useToast();

// --- Kavita
const username = ref('');
const password = ref('');
const loggingIn = ref(false);
const loginError = ref('');

async function login(): Promise<void> {
  if (!username.value.trim() || !password.value) return;
  loggingIn.value = true;
  loginError.value = '';
  try {
    await session.kavitaLogin(username.value.trim(), password.value);
    password.value = '';
    toast.add({ title: '已登录 Kavita', color: 'success' });
  } catch (err) {
    loginError.value = errorMessage(err);
  } finally {
    loggingIn.value = false;
  }
}

function openKavita(): void {
  if (!openExternal(session.kavitaLoginUrl)) {
    toast.add({ title: 'Kavita 地址无效，无法打开', color: 'error' });
  }
}

function logout(): void {
  session.kavitaLogout();
  toast.add({ title: '已退出 Kavita', color: 'neutral' });
}

// --- Maintenance
const rezipping = ref(false);

async function rezip(): Promise<void> {
  const ok = await ui.confirm({
    title: '重新打包全部漫画？',
    description: '会在下载队列中加入一个任务，按当前命名规则重新整理并打包下载目录中的所有漫画。漫画较多时需要较长时间。',
    confirmLabel: '重新打包',
  });
  if (!ok) return;
  rezipping.value = true;
  try {
    await library.rezip();
    toast.add({ title: '已加入下载队列', description: '重新打包全部漫画', color: 'success' });
  } catch (err) {
    if (isApiError(err) && err.isAdminTokenError) return;
    const text = errorMessage(err);
    if (text) toast.add({ title: text, color: 'error' });
  } finally {
    rezipping.value = false;
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 sm:px-6" data-testid="settings-view">
    <h1 class="text-xl font-semibold">设置</h1>

    <section class="space-y-3 rounded-lg bg-vm-card p-4" aria-labelledby="kavita-heading" data-testid="kavita-section">
      <h2 id="kavita-heading" class="font-medium">Kavita</h2>

      <div v-if="config.error && !config.config" class="flex items-center gap-3 text-sm">
        <span class="flex-1 text-vm-danger">无法读取服务器配置：{{ errorMessage(config.error) }}</span>
        <UButton size="sm" color="neutral" variant="outline" @click="config.load()">重试</UButton>
      </div>
      <USkeleton v-else-if="!config.config" class="h-10 w-full bg-vm-divider" />

      <p v-else-if="!config.kavitaEnabled" class="text-sm text-vm-muted" data-testid="kavita-disabled">
        服务器未启用 Kavita
      </p>

      <div v-else-if="session.kavitaLoggedIn" class="space-y-3" data-testid="kavita-logged-in">
        <p class="flex items-center gap-2 text-sm">
          <span class="size-2 rounded-full bg-vm-accent" aria-hidden="true" />
          已登录 Kavita，可从漫画菜单直接打开
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton class="vm-gradient-btn" icon="i-lucide-external-link" @click="openKavita">打开 Kavita</UButton>
          <UButton color="neutral" variant="outline" @click="logout">退出登录</UButton>
        </div>
      </div>

      <form v-else class="space-y-3" data-testid="kavita-login" @submit.prevent="login">
        <p class="text-sm text-vm-muted">登录后可以从漫画菜单直接在 Kavita 中打开。</p>
        <UInput
          v-model="username"
          placeholder="用户名"
          aria-label="Kavita 用户名"
          autocomplete="username"
          class="w-full"
          data-testid="kavita-username"
        />
        <UInput
          v-model="password"
          type="password"
          placeholder="密码"
          aria-label="Kavita 密码"
          autocomplete="current-password"
          class="w-full"
          data-testid="kavita-password"
        />
        <p v-if="loginError" class="text-sm text-vm-danger" role="alert">{{ loginError }}</p>
        <UButton
          type="submit"
          class="vm-gradient-btn"
          :loading="loggingIn"
          :disabled="loggingIn || !username.trim() || !password"
        >
          登录
        </UButton>
      </form>
    </section>

    <section class="space-y-3 rounded-lg bg-vm-card p-4" aria-labelledby="maintenance-heading">
      <h2 id="maintenance-heading" class="font-medium">维护</h2>
      <p class="text-sm text-vm-muted">
        按当前命名规则重新整理并打包下载目录中的所有漫画。<span v-if="config.adminRequired">需要管理员口令。</span>
      </p>
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-archive-restore"
        :loading="rezipping"
        data-testid="rezip-button"
        @click="rezip"
      >
        重新打包全部漫画
      </UButton>
    </section>

    <section class="space-y-4 rounded-lg bg-vm-card p-4" aria-labelledby="about-heading">
      <h2 id="about-heading" class="font-medium">关于</h2>
      <img :src="valiyaLogo" alt="Valiya" class="h-14 w-auto invert" width="157" height="56" />
      <p class="text-sm">
        <span class="font-semibold text-white">Van</span><span class="vm-gradient-text font-semibold">Manga</span>
        <span class="text-vm-muted"> · Valiya-Manga 夜镇漫画</span>
      </p>
      <ul class="list-disc space-y-1.5 pl-5 text-sm text-vm-muted">
        <li>本系统用于把漫画添加进漫画库并自动下载，当前的漫画源为漫画狗（DogeManga）。</li>
        <li>为避免被源站限制，同一时间只下载一部漫画；添加多部时会排队依次下载。</li>
        <li>搜索结果来自漫画狗的搜索，如需确认是否是想要的漫画，可以在漫画狗中核对。</li>
        <li>开启自动更新的漫画每天会自动检查一次新章节。</li>
        <li>漫画源可能存在缺页；个别章节有问题时，可以在漫画菜单中选择章节重新下载。</li>
      </ul>
      <p class="text-right text-xs text-vm-muted">—— Tom "Van" Wang &amp; Kun "Alen" Qi</p>
    </section>
  </main>
</template>
