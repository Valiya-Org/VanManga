# 前端 Vue3 地基 + 统一构建 实现计划（计划 1/3）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `nestjs/` 改名为 `backend/`，新建根编排脚本，搭起 `frontend/`（Vue3 + Vite + TS + Pinia + element-plus/vant + socket composable）骨架，并让 `npm run build` 一条命令产出前后端、由 NestJS 单进程托管这个 Vue3 骨架。

**Architecture:** 根目录同级 `frontend/` + `backend/`，根 `package.json` 用 `npm --prefix` 编排两边的 install/build。前端 Vite 产物输出到 `frontend/dist/`，后端 `FrontendModule` 改指向该目录。开发期 Vite proxy 把 `/api`、`/socket.io`、`/js/config.js` 打到 NestJS（5000）。

**Tech Stack:** Vue 3.5、Vite 6、TypeScript 5.7、vue-router 4、Pinia 2、element-plus 2、vant 4、socket.io-client 4、Vitest 2、NestJS 11。

**配套规格：** `docs/superpowers/specs/2026-06-06-frontend-vue3-rewrite-unified-build-design.md`

**本计划范围：** 仅地基与统一构建。**不含** 任何业务页面重写（SearchPage/MangaKu/KavitaCheckPage/MainPage 等内容留给计划 2），**不含** 删除旧 `frontend_src/`、`frontend_static/`（留给计划 3）。本计划结束时 `frontend/` 是一个能路由、能构建、被后端托管的占位骨架。

**环境说明：** 平台 win32 / PowerShell。命令给出 PowerShell 形式；`npm`/`git` 命令跨平台通用。所有命令默认在仓库根 `D:\disk 1\vanmanga_git\VanManga` 下执行（除非显式 `--prefix`）。

---

## 文件结构总览

本计划新建/修改的文件：

**根目录**
- 新建 `package.json` — 编排脚本（build / dev / start:prod）
- 修改 `.gitignore` — 忽略 `frontend/node_modules`、`frontend/dist`

**重命名**
- `nestjs/` → `backend/`（整目录移动，git 识别为重命名）

**后端（重命名后在 `backend/`）**
- 修改 `backend/src/modules/frontend/frontend.module.ts` — `STATIC_ROOT` 指向 `frontend/dist`
- 修改 `backend/src/main.ts` — `indexPath` 改为 `frontend/dist/index.html`
- 新建 `backend/test/frontend-static.e2e-spec.ts` — 验证 `/` 返回 SPA index.html

**前端（全部新建于 `frontend/`）**
- `frontend/package.json` — 前端依赖与脚本
- `frontend/tsconfig.json`、`frontend/tsconfig.node.json` — TS 配置
- `frontend/vite.config.ts` — 插件、proxy、build.outDir
- `frontend/vitest.config.ts` — 测试配置（jsdom）
- `frontend/env.d.ts` — `.vue`、`window` 全局类型声明
- `frontend/index.html` — 入口 HTML，含 `/js/config.js`
- `frontend/src/main.ts` — createApp 装配
- `frontend/src/App.vue` — 根组件（`<router-view>`）
- `frontend/src/router/index.ts` — 路由骨架
- `frontend/src/stores/app.ts` — Pinia app store
- `frontend/src/api/http.ts` — axios 实例
- `frontend/src/composables/useSocket.ts` — socket.io 封装
- `frontend/src/views/SearchPage.vue` 等 5 个占位 view（仅骨架，内容计划 2 填）
- `frontend/.gitignore` — 前端本地忽略
- 各测试：`frontend/src/**/*.spec.ts`

---

## Task 1: 把 `nestjs/` 改名为 `backend/`

**Files:**
- Move: `nestjs/` → `backend/`（含已跟踪与未跟踪文件）

> 注意：当前分支 `feature/nestjs-migration-stage-0-1` 在 `nestjs/` 下有未提交改动与未跟踪文件。`git mv` 对未跟踪文件会失败，因此用整目录文件系统移动 + `git add -A`，由 git 的重命名检测识别。移动会把现有 WIP 一并纳入提交——这是同一特性分支的工作，可接受。

- [ ] **Step 1: 确认当前在仓库根且分支正确**

Run:
```powershell
git rev-parse --show-toplevel; git branch --show-current
```
Expected: 输出仓库根路径，分支为 `feature/nestjs-migration-stage-0-1`。

- [ ] **Step 2: 确认目标目录 `backend/` 尚不存在**

Run:
```powershell
Test-Path backend
```
Expected: `False`。

- [ ] **Step 3: 整目录移动 `nestjs` → `backend`**

Run:
```powershell
Move-Item -Path nestjs -Destination backend
```
Expected: 无输出，命令成功。

- [ ] **Step 4: 暂存改动并确认 git 识别为重命名**

Run:
```powershell
git add -A; git status --short | Select-String -Pattern "->" | Select-Object -First 5
```
Expected: 出现形如 `R  nestjs/... -> backend/...` 的重命名条目（具体条数不限）。

- [ ] **Step 5: 验证后端在新目录仍可构建**

Run:
```powershell
npm --prefix backend install; npm --prefix backend run build
```
Expected: `nest build` 成功，生成 `backend/dist/main.js`。验证：
```powershell
Test-Path backend/dist/main.js
```
Expected: `True`。

- [ ] **Step 6: 提交**

```powershell
git add -A
git commit -m "refactor: rename nestjs/ to backend/"
```

---

## Task 2: 新建根编排 `package.json` 与根 `.gitignore` 更新

**Files:**
- Create: `package.json`
- Modify: `.gitignore`
- Delete: `package-lock.json`（仓库根那个空 stub，避免与新根 package 混淆）

- [ ] **Step 1: 删除根目录空的 package-lock stub**

Run:
```powershell
if (Test-Path package-lock.json) { Remove-Item package-lock.json }
```
Expected: 无输出。（该文件原内容为 `{ "name": "VanManga", "packages": {} }` 的空壳，无依赖，删除无影响。）

- [ ] **Step 2: 创建根 `package.json`**

Create `package.json`:
```json
{
  "name": "vanmanga",
  "version": "1.0.0",
  "private": true,
  "description": "VanManga monorepo root — orchestrates frontend (Vue3/Vite) and backend (NestJS) builds",
  "scripts": {
    "build": "npm run build:frontend && npm run build:backend",
    "build:frontend": "npm --prefix frontend install && npm --prefix frontend run build",
    "build:backend": "npm --prefix backend install && npm --prefix backend run build",
    "start:prod": "npm --prefix backend run start:prod",
    "dev:backend": "npm --prefix backend run start:dev",
    "dev:frontend": "npm --prefix frontend run dev",
    "test:frontend": "npm --prefix frontend run test"
  }
}
```

- [ ] **Step 3: 更新根 `.gitignore`**

在 `.gitignore` 末尾追加以下行（保留原有内容）:
```
# frontend (Vite)
/frontend/node_modules
/frontend/dist
```

实现：读出现有 `.gitignore`，在文件末尾追加上述三行。

- [ ] **Step 4: 验证 JSON 合法**

Run:
```powershell
node -e "require('./package.json'); console.log('root package.json OK')"
```
Expected: 打印 `root package.json OK`。

- [ ] **Step 5: 提交**

```powershell
git add package.json .gitignore
git rm --cached package-lock.json 2>$null; git add -A
git commit -m "build: add root package.json orchestrating frontend+backend builds"
```

---

## Task 3: 搭建 `frontend/` Vite + Vue3 + TS 骨架（可启动、可构建）

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/.gitignore`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/env.d.ts`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.ts`
- Create: `frontend/src/App.vue`

- [ ] **Step 1: 创建 `frontend/package.json`**

Create `frontend/package.json`:
```json
{
  "name": "vanmanga-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "axios": "^1.7.9",
    "element-plus": "^2.9.1",
    "overlayscrollbars": "^2.10.1",
    "overlayscrollbars-vue": "^0.5.9",
    "pinia": "^2.3.0",
    "socket.io-client": "^4.8.1",
    "vant": "^4.9.15",
    "vue": "^3.5.13",
    "vue-router": "^4.5.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.7",
    "@vitejs/plugin-vue": "^5.2.1",
    "@vue/test-utils": "^2.4.6",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.3",
    "vite": "^6.0.7",
    "vitest": "^2.1.8",
    "vue-tsc": "^2.2.0"
  }
}
```

- [ ] **Step 2: 创建 `frontend/.gitignore`**

Create `frontend/.gitignore`:
```
node_modules
dist
*.local
.DS_Store
coverage
```

- [ ] **Step 3: 创建 `frontend/tsconfig.json`**

Create `frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.vue", "env.d.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: 创建 `frontend/tsconfig.node.json`**

Create `frontend/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 5: 创建 `frontend/env.d.ts`**

Create `frontend/env.d.ts`:
```typescript
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// Injected at runtime by the backend via GET /js/config.js
interface Window {
  MANGA_BASE_URL?: string;
  MANGA_BASE_WEBSOCKET_URL?: string;
}
```

- [ ] **Step 6: 创建 `frontend/vite.config.ts`**

Create `frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// Backend (NestJS) dev server
const BACKEND = 'http://localhost:5000';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/socket.io': { target: BACKEND, ws: true, changeOrigin: true },
      '/js/config.js': { target: BACKEND, changeOrigin: true },
    },
  },
});
```

- [ ] **Step 7: 创建 `frontend/index.html`**

Create `frontend/index.html`:
```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VanManga</title>
    <!-- Runtime config injected by NestJS backend (GET /js/config.js) -->
    <script src="/js/config.js"></script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 8: 创建 `frontend/src/App.vue`**

Create `frontend/src/App.vue`:
```vue
<script setup lang="ts">
// Root shell. Page chrome will be added during page-rewrite plan.
</script>

<template>
  <router-view />
</template>
```

- [ ] **Step 9: 创建 `frontend/src/main.ts`**

> 说明：本步先做**最小可运行**的 main.ts，只装配此刻已存在的 App。router 在 Task 4、Pinia 在 Task 5、UI 库在 Task 8 再增量补充 import——每个 Task 会给出 main.ts 的完整新内容。

Create `frontend/src/main.ts`:
```typescript
import { createApp } from 'vue';
import App from './App.vue';

const app = createApp(App);
app.mount('#app');
```

- [ ] **Step 10: 安装依赖**

Run:
```powershell
npm --prefix frontend install
```
Expected: 安装成功，生成 `frontend/node_modules` 与 `frontend/package-lock.json`。

- [ ] **Step 11: 验证可构建**

Run:
```powershell
npm --prefix frontend run build
```
Expected: `vue-tsc` 类型检查通过，`vite build` 成功，生成 `frontend/dist/index.html`。验证：
```powershell
Test-Path frontend/dist/index.html
```
Expected: `True`。

- [ ] **Step 12: 提交**

```powershell
git add frontend/package.json frontend/package-lock.json frontend/.gitignore frontend/tsconfig.json frontend/tsconfig.node.json frontend/env.d.ts frontend/vite.config.ts frontend/index.html frontend/src
git commit -m "feat(frontend): scaffold Vite + Vue3 + TS skeleton"
```

---

## Task 4: 路由骨架 + 占位页面（TDD）

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/views/SearchPage.vue`
- Create: `frontend/src/views/MangaKu.vue`
- Create: `frontend/src/views/KavitaCheckPage.vue`
- Create: `frontend/src/views/MainPage.vue`
- Create: `frontend/src/views/ErrorPage.vue`
- Create: `frontend/src/router/index.ts`
- Test: `frontend/src/router/router.spec.ts`
- Modify: `frontend/src/main.ts`

> 占位页面只放标识性内容，业务内容由计划 2 填充。路由行为需对齐旧版：history 模式；`/` 与 `/mainpage` 重定向到 `/mainpage/searchpage`；`/mainpage` 下子路由 `searchpage`/`mangaku`/`kavitaLinkCheck`；通配兜底 `ErrorPage`。

- [ ] **Step 1: 创建 `frontend/vitest.config.ts`**

Create `frontend/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
```

- [ ] **Step 2: 创建 5 个占位 view**

Create `frontend/src/views/SearchPage.vue`:
```vue
<script setup lang="ts">
</script>
<template>
  <div data-testid="search-page">SearchPage</div>
</template>
```

Create `frontend/src/views/MangaKu.vue`:
```vue
<script setup lang="ts">
</script>
<template>
  <div data-testid="mangaku-page">MangaKu</div>
</template>
```

Create `frontend/src/views/KavitaCheckPage.vue`:
```vue
<script setup lang="ts">
</script>
<template>
  <div data-testid="kavita-page">KavitaCheckPage</div>
</template>
```

Create `frontend/src/views/MainPage.vue`:
```vue
<script setup lang="ts">
// Layout shell: hosts child routes. Real chrome added in page-rewrite plan.
</script>
<template>
  <div data-testid="main-page">
    <router-view />
  </div>
</template>
```

Create `frontend/src/views/ErrorPage.vue`:
```vue
<script setup lang="ts">
</script>
<template>
  <div data-testid="error-page">Error</div>
</template>
```

- [ ] **Step 3: 写失败测试**

Create `frontend/src/router/router.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createRouter, createMemoryHistory } from 'vue-router';
import { routes } from './index';

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes });
}

describe('router', () => {
  it('redirects / to /mainpage/searchpage', async () => {
    const router = makeRouter();
    await router.push('/');
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe('/mainpage/searchpage');
  });

  it('redirects /mainpage to /mainpage/searchpage', async () => {
    const router = makeRouter();
    await router.push('/mainpage');
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe('/mainpage/searchpage');
  });

  it('resolves /mainpage/mangaku to MangaKu', async () => {
    const router = makeRouter();
    await router.push('/mainpage/mangaku');
    await router.isReady();
    expect(router.currentRoute.value.matched.at(-1)?.name).toBe('MangaKu');
  });

  it('resolves /mainpage/kavitaLinkCheck to KavitaCheck', async () => {
    const router = makeRouter();
    await router.push('/mainpage/kavitaLinkCheck');
    await router.isReady();
    expect(router.currentRoute.value.matched.at(-1)?.name).toBe('KavitaCheck');
  });

  it('falls back unknown paths to Error', async () => {
    const router = makeRouter();
    await router.push('/nope/nope');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Error');
  });
});
```

- [ ] **Step 4: 运行测试，确认失败**

Run:
```powershell
npm --prefix frontend run test
```
Expected: FAIL — 无法解析 `./index`（router 尚未创建）。

- [ ] **Step 5: 实现 `frontend/src/router/index.ts`**

Create `frontend/src/router/index.ts`:
```typescript
import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from 'vue-router';
import MainPage from '@/views/MainPage.vue';
import SearchPage from '@/views/SearchPage.vue';
import MangaKu from '@/views/MangaKu.vue';
import KavitaCheckPage from '@/views/KavitaCheckPage.vue';
import ErrorPage from '@/views/ErrorPage.vue';

export const routes: RouteRecordRaw[] = [
  {
    path: '/mainpage',
    name: 'MainPage',
    component: MainPage,
    redirect: '/mainpage/searchpage',
    children: [
      { path: 'searchpage', name: 'SearchPage', component: SearchPage },
      { path: 'mangaku', name: 'MangaKu', component: MangaKu },
      {
        path: 'kavitaLinkCheck',
        name: 'KavitaCheck',
        component: KavitaCheckPage,
      },
    ],
  },
  { path: '/', redirect: '/mainpage/searchpage' },
  {
    path: '/:pathMatch(.*)*',
    name: 'Error',
    component: ErrorPage,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
```

- [ ] **Step 6: 运行测试，确认通过**

Run:
```powershell
npm --prefix frontend run test
```
Expected: PASS — 5 个 router 用例全部通过。

- [ ] **Step 7: 在 `main.ts` 装配 router**

Modify `frontend/src/main.ts` 为:
```typescript
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

const app = createApp(App);
app.use(router);
app.mount('#app');
```

- [ ] **Step 8: 验证构建仍通过**

Run:
```powershell
npm --prefix frontend run build
```
Expected: 成功。

- [ ] **Step 9: 提交**

```powershell
git add frontend/vitest.config.ts frontend/src/views frontend/src/router frontend/src/main.ts
git commit -m "feat(frontend): router skeleton with placeholder views (TDD)"
```

---

## Task 5: Pinia app store（TDD）

**Files:**
- Create: `frontend/src/stores/app.ts`
- Test: `frontend/src/stores/app.spec.ts`
- Modify: `frontend/src/main.ts`

> 对齐旧 vuex：`isPhone`（`clientWidth < 993`）、`isLogin`（旧名 `isLoginAlready`，统一为 `isLogin`）。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/stores/app.spec.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppStore } from './app';

describe('useAppStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('defaults isLogin to false', () => {
    const store = useAppStore();
    expect(store.isLogin).toBe(false);
  });

  it('setIsPhone updates isPhone', () => {
    const store = useAppStore();
    store.setIsPhone(true);
    expect(store.isPhone).toBe(true);
    store.setIsPhone(false);
    expect(store.isPhone).toBe(false);
  });

  it('setIsLogin updates isLogin', () => {
    const store = useAppStore();
    store.setIsLogin(true);
    expect(store.isLogin).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:
```powershell
npm --prefix frontend run test
```
Expected: FAIL — 无法解析 `./app`。

- [ ] **Step 3: 实现 `frontend/src/stores/app.ts`**

Create `frontend/src/stores/app.ts`:
```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';

const PHONE_BREAKPOINT = 993;

export const useAppStore = defineStore('app', () => {
  const isPhone = ref(
    typeof document !== 'undefined' &&
      document.documentElement.clientWidth < PHONE_BREAKPOINT,
  );
  const isLogin = ref(false);

  function setIsPhone(value: boolean): void {
    isPhone.value = value;
  }

  function setIsLogin(value: boolean): void {
    isLogin.value = value;
  }

  return { isPhone, isLogin, setIsPhone, setIsLogin };
});
```

- [ ] **Step 4: 运行测试，确认通过**

Run:
```powershell
npm --prefix frontend run test
```
Expected: PASS。

- [ ] **Step 5: 在 `main.ts` 装配 Pinia**

Modify `frontend/src/main.ts` 为:
```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
```

- [ ] **Step 6: 提交**

```powershell
git add frontend/src/stores frontend/src/main.ts
git commit -m "feat(frontend): pinia app store (TDD)"
```

---

## Task 6: axios HTTP 实例（TDD）

**Files:**
- Create: `frontend/src/api/http.ts`
- Test: `frontend/src/api/http.spec.ts`

> 对齐旧版：`baseURL='/api'`。具体接口模块（dogemanga/kavita）随页面在计划 2 创建——本计划只立基础实例。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/api/http.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { http } from './http';

describe('http instance', () => {
  it('uses /api as baseURL', () => {
    expect(http.defaults.baseURL).toBe('/api');
  });

  it('is an axios instance with get/post methods', () => {
    expect(typeof http.get).toBe('function');
    expect(typeof http.post).toBe('function');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:
```powershell
npm --prefix frontend run test
```
Expected: FAIL — 无法解析 `./http`。

- [ ] **Step 3: 实现 `frontend/src/api/http.ts`**

Create `frontend/src/api/http.ts`:
```typescript
import axios, { type AxiosInstance } from 'axios';

/**
 * Shared axios instance. All API modules import this.
 * baseURL '/api' matches the NestJS global prefix; in dev the Vite
 * proxy forwards /api to the backend.
 */
export const http: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
});
```

- [ ] **Step 4: 运行测试，确认通过**

Run:
```powershell
npm --prefix frontend run test
```
Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add frontend/src/api
git commit -m "feat(frontend): shared axios http instance (TDD)"
```

---

## Task 7: `useSocket` composable（TDD）

**Files:**
- Create: `frontend/src/composables/useSocket.ts`
- Test: `frontend/src/composables/useSocket.spec.ts`

> 用 `socket.io-client` 连默认命名空间（dev 下 Vite proxy `/socket.io`）。测试用 `vi.mock` 桩掉 `socket.io-client`，验证连接地址与生命周期接口，不发真实网络。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/composables/useSocket.spec.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ioMock = vi.fn();
const socketStub = {
  on: vi.fn(),
  off: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
};

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => {
    ioMock(...args);
    return socketStub;
  },
}));

import { useSocket } from './useSocket';

describe('useSocket', () => {
  beforeEach(() => {
    ioMock.mockClear();
    socketStub.connect.mockClear();
    socketStub.disconnect.mockClear();
  });

  it('creates a socket with autoConnect disabled', () => {
    useSocket();
    expect(ioMock).toHaveBeenCalledTimes(1);
    const options = ioMock.mock.calls[0][1] as { autoConnect: boolean };
    expect(options.autoConnect).toBe(false);
  });

  it('exposes connect and disconnect that delegate to the socket', () => {
    const { connect, disconnect } = useSocket();
    connect();
    expect(socketStub.connect).toHaveBeenCalledTimes(1);
    disconnect();
    expect(socketStub.disconnect).toHaveBeenCalledTimes(1);
  });

  it('on() registers an event handler', () => {
    const { on } = useSocket();
    const handler = vi.fn();
    on('download_progress', handler);
    expect(socketStub.on).toHaveBeenCalledWith('download_progress', handler);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:
```powershell
npm --prefix frontend run test
```
Expected: FAIL — 无法解析 `./useSocket`。

- [ ] **Step 3: 实现 `frontend/src/composables/useSocket.ts`**

Create `frontend/src/composables/useSocket.ts`:
```typescript
import { io, type Socket } from 'socket.io-client';

/**
 * Wraps a socket.io-client connection to the backend default namespace.
 * In dev, Vite proxies /socket.io to NestJS; in prod they share an origin,
 * so the empty URL (current origin) is correct. autoConnect is off so
 * callers control when the connection opens.
 */
export function useSocket() {
  const socket: Socket = io({
    path: '/socket.io',
    autoConnect: false,
    withCredentials: true,
  });

  function connect(): void {
    socket.connect();
  }

  function disconnect(): void {
    socket.disconnect();
  }

  function on(event: string, handler: (...args: unknown[]) => void): void {
    socket.on(event, handler);
  }

  function off(event: string, handler?: (...args: unknown[]) => void): void {
    socket.off(event, handler);
  }

  return { socket, connect, disconnect, on, off };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run:
```powershell
npm --prefix frontend run test
```
Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add frontend/src/composables
git commit -m "feat(frontend): useSocket composable (TDD)"
```

---

## Task 8: 注册 UI 库（element-plus + vant）

**Files:**
- Modify: `frontend/src/main.ts`

> 两套 UI 库都全量注册（按 spec 决策保留桌面+移动）。后续计划 2 可按需改为按需引入，本计划先求装好、构建通过。

- [ ] **Step 1: 在 `main.ts` 注册 element-plus 与 vant**

Modify `frontend/src/main.ts` 为:
```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';

import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';

import Vant from 'vant';
import 'vant/lib/index.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(ElementPlus);
app.use(Vant);
app.mount('#app');
```

- [ ] **Step 2: 验证类型检查 + 构建通过**

Run:
```powershell
npm --prefix frontend run build
```
Expected: `vue-tsc` 与 `vite build` 均成功，`frontend/dist/index.html` 生成。

- [ ] **Step 3: 验证测试仍全绿**

Run:
```powershell
npm --prefix frontend run test
```
Expected: PASS（router/store/http/useSocket 全部通过）。

- [ ] **Step 4: 提交**

```powershell
git add frontend/src/main.ts
git commit -m "feat(frontend): register element-plus and vant"
```

---

## Task 9: 后端 `FrontendModule` 改指向 `frontend/dist`

**Files:**
- Modify: `backend/src/modules/frontend/frontend.module.ts`
- Modify: `backend/src/main.ts:58`

> Vite 标准布局：产物根即 `frontend/dist/index.html` + `frontend/dist/assets/`，没有 `templates/` 子目录。运行时 `__dirname` = `backend/dist/modules/frontend`，上溯 4 层到仓库根，再接 `frontend/dist`。

- [ ] **Step 1: 修改 `STATIC_ROOT` 与模块注释**

在 `backend/src/modules/frontend/frontend.module.ts` 中，把:
```typescript
const STATIC_ROOT = resolve(
  __dirname, '..', '..', '..', '..', 'frontend_static', 'static',
);
```
改为:
```typescript
// __dirname at runtime = backend/dist/modules/frontend → up 4 = repo root.
// Vite outputs the SPA to <root>/frontend/dist (index.html + assets/).
const STATIC_ROOT = resolve(
  __dirname, '..', '..', '..', '..', 'frontend', 'dist',
);
```

并将该文件顶部块注释中描述 `frontend_static/static/` 与 `templates/` 的两处旧说明，更新为：产物来自 Vite (`frontend/dist`)，`index.html` 在产物根目录。

- [ ] **Step 2: 修改 `main.ts` 的 indexPath**

在 `backend/src/main.ts` 第 58 行附近，把:
```typescript
const indexPath = join(STATIC_ROOT, 'templates', 'index.html');
```
改为:
```typescript
const indexPath = join(STATIC_ROOT, 'index.html');
```

- [ ] **Step 3: 构建前端产物（供后端托管/测试用）**

Run:
```powershell
npm --prefix frontend run build
```
Expected: 生成 `frontend/dist/index.html`。

- [ ] **Step 4: 后端编译通过**

Run:
```powershell
npm --prefix backend run build
```
Expected: `nest build` 成功。

- [ ] **Step 5: 提交**

```powershell
git add backend/src/modules/frontend/frontend.module.ts backend/src/main.ts
git commit -m "feat(backend): serve Vue3 SPA from frontend/dist"
```

---

## Task 10: 统一构建端到端验证（e2e 测试 + 手动冒烟）

**Files:**
- Create: `backend/test/frontend-static.e2e-spec.ts`

> 该 e2e 启动 Nest 应用，断言 `GET /` 返回 200 且响应体含 SPA 挂载点 `<div id="app">`，从而验证「前端产物被后端正确托管」。**前置：`frontend/dist` 必须已构建**（Task 9 Step 3 已构建；测试运行前确保存在）。
>
> e2e 配置 `backend/test/jest-e2e.json` 的 `testRegex` 为 `.e2e-spec.ts$`、`rootDir` 为 `.`，新文件 `frontend-static.e2e-spec.ts` 自动被匹配，**无需改配置**。

- [ ] **Step 1: 写 e2e 测试**

Create `backend/test/frontend-static.e2e-spec.ts`:
```typescript
import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { STATIC_ROOT } from '../src/modules/frontend/frontend.module';

describe('Frontend static serving (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();

    // Mirror the SPA fallback registered in main.ts so '/' serves index.html.
    const indexPath = join(STATIC_ROOT, 'index.html');
    await app.init();
    app.use(
      (
        req: import('express').Request,
        res: import('express').Response,
        next: import('express').NextFunction,
      ) => {
        if (
          req.method === 'GET' &&
          !req.path.startsWith('/api/') &&
          !req.path.startsWith('/socket.io')
        ) {
          res.sendFile(indexPath, (err) => {
            if (err) next();
          });
        } else {
          next();
        }
      },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / returns the SPA index.html', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="app">');
  });

  it('GET /js/config.js returns runtime config', async () => {
    const res = await request(app.getHttpServer()).get('/js/config.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('window.MANGA_BASE_URL');
  });
});
```

- [ ] **Step 2: 运行 e2e，确认通过**

Run:
```powershell
npm --prefix backend run test:e2e -- frontend-static
```
Expected: PASS — 两个用例通过（`/` 返回含 `<div id="app">` 的 index.html；`/js/config.js` 返回含 `window.MANGA_BASE_URL`）。

> 若 `GET /` 失败提示找不到文件：确认 `frontend/dist/index.html` 已构建（`npm --prefix frontend run build`）。

- [ ] **Step 3: 根命令统一构建冒烟**

Run:
```powershell
npm run build
```
Expected: 依次完成 `build:frontend`（Vite 产物到 `frontend/dist`）与 `build:backend`（`nest build` 到 `backend/dist`），无错误。

- [ ] **Step 4: 手动运行冒烟（可选但推荐）**

Run（后台启动后请求根路径，再停止）:
```powershell
$p = Start-Process -FilePath "npm" -ArgumentList "run","start:prod" -PassThru -NoNewWindow
Start-Sleep -Seconds 6
try { (Invoke-WebRequest -Uri "http://localhost:5000/" -UseBasicParsing).Content | Select-String "id=`"app`"" } finally { Stop-Process -Id $p.Id -Force }
```
Expected: 输出含 `id="app"` 的一行，证明 NestJS 单进程托管了 Vue3 骨架。

- [ ] **Step 5: 提交**

```powershell
git add backend/test/frontend-static.e2e-spec.ts
git commit -m "test(backend): e2e for unified build SPA serving"
```

---

## Task 11: 更新文档

**Files:**
- Modify: `backend/README.md:114`（`frontend_static/static/` 描述改为 `frontend/dist`）
- Create: `README.md` 顶部增补「本地开发 / 构建」小节，或新建 `frontend/README.md`

- [ ] **Step 1: 修正 backend/README 中的静态目录描述**

在 `backend/README.md` 第 114 行附近，把提到「serves ... from `frontend_static/static/`」的句子改为「serves the Vue3 SPA from `frontend/dist/` (Vite build output)」。

- [ ] **Step 2: 增补根/前端 README 的开发说明**

Create `frontend/README.md`:
```markdown
# VanManga Frontend (Vue 3 + Vite)

## 开发

后端（NestJS，端口 5000）：

    npm run dev:backend      # 在仓库根执行

前端（Vite HMR，端口 5173，proxy /api、/socket.io、/js/config.js 到后端）：

    npm run dev:frontend     # 在仓库根执行

浏览器访问 http://localhost:5173 。

## 生产构建

在仓库根执行：

    npm run build            # 先打前端到 frontend/dist，再 nest build
    npm run start:prod       # NestJS 单进程托管 API + 前端

## 测试

    npm run test:frontend    # 在仓库根执行（Vitest）
```

- [ ] **Step 3: 提交**

```powershell
git add backend/README.md frontend/README.md
git commit -m "docs: update for frontend/ + backend/ split and unified build"
```

---

## 完成标准（计划 1）

- `nestjs/` 已改名为 `backend/`，后端可独立构建运行。
- 根 `package.json` 提供 `build` / `start:prod` / `dev:backend` / `dev:frontend` / `test:frontend`。
- `frontend/` 是 Vite + Vue3 + TS 项目，含路由骨架、Pinia store、axios 实例、useSocket、两套 UI 库，`npm --prefix frontend run test` 全绿、`build` 通过。
- 后端 `FrontendModule` 托管 `frontend/dist`；e2e 验证 `GET /` 返回 SPA、`GET /js/config.js` 返回运行时配置。
- 仓库根 `npm run build` 一条命令产出前后端；`start:prod` 单进程托管 Vue3 骨架。

## 后续计划（不在本计划内）

- **计划 2：逐页重写** — SearchPage / MangaKu / KavitaCheckPage / MainPage / 组件（desktop+mobile），含 `api/dogemanga.ts`、`api/kavita.ts`、`useResponsive`、各页业务逻辑与 socket 下载进度接入。需在地基落地后、对照旧 `frontend_src/` 组件逐个编写。
- **计划 3：切换清理** — 全部页面验证通过后删除 `frontend_src/`、清理 `frontend_static/` 及后端旧路径引用、更新 Dockerfile。
