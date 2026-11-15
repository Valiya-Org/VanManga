# VanManga 前端架构参考（逐文件、逐函数）

对应提交：`feature/nestjs-migration-stage-0-1`（迁移完成后的 Vue 3.5 + Pinia + Nuxt UI 4 前端）。

相关文档：

- 总览：[`../architecture.md`](../architecture.md)（本文是其第 5、6 节的细化版）
- 前端数据层公共接口：[`../frontend-data-layer.md`](../frontend-data-layer.md)
- 接口契约：[`../api-contract.md`](../api-contract.md)
- 页面设计：[`../superpowers/specs/2026-11-14-p3b-frontend-pages-design.md`](../superpowers/specs/2026-11-14-p3b-frontend-pages-design.md)

阅读约定：

- 每个文件一个小节：路径、职责、是否有同名 spec，然后逐个列出导出符号、函数、store 字段、getter、动作、组件 props / emits / model、watcher、生命周期钩子和模板里的分支。
- **作用**：做什么（输入、返回值、reject 的错误或结果值、副作用：HTTP 方法与路径、localStorage 键、toast 的原文、store 改动）。
- **调用方**：在代码里搜索得到的具体位置（`文件 → 函数/组件`）。只在测试里用到的写"仅测试使用"，完全没人用的写"未使用"。
- **实现说明**：只在实现不直观时出现，讲算法、先后顺序、并发保证，以及为什么这么做（多数理由来自代码注释）。
- 文中 "toast" 指 Nuxt UI 的 `useToast().add(...)`；颜色写作 `color: 'success'` 等，与代码一致。
- 路径都相对 `frontend/`。

---

## 目录

1. 启动顺序
2. 数据流
3. 组件树
4. 浏览器里保存的东西
5. 工程配置文件
6. `src/main.ts`、`src/App.vue`、`src/router/index.ts`
7. 接口层 `src/api/`
8. 状态 `src/stores/`
9. Socket：`src/composables/useSocket.ts`、`src/socket/dispatcher.ts`、`src/composables/useRealtime.ts`
10. 其他组合函数 `src/composables/`
11. 错误文案与工具 `src/errors/`、`src/utils/`
12. 样式 `src/assets/`
13. 外壳 `src/layouts/AppShell.vue`
14. 页面 `src/views/`
15. 组件 `src/components/`
16. 测试辅助 `src/test/` 与端到端 `e2e/`
17. spec 文件一览

---

## 1. 启动顺序

从浏览器打开页面到第一次拿到数据，按时间顺序：

1. 浏览器加载 `index.html`。`<html lang="zh-CN" class="dark">` 固定深色，`<div id="app" class="isolate">` 是挂载点，`<script type="module" src="/src/main.ts">` 是入口（生产构建后由 Vite 换成带哈希的资源）。
2. `src/main.ts` 在导入阶段先导入 `./assets/main.css`（Tailwind、Nuxt UI 样式和调色板），再依次：`createApp(App)` → `app.use(createPinia())` → `app.use(router)`（路由开始解析首个地址）→ `app.use(ui)`（Nuxt UI 的 Vue 插件）→ `app.mount('#app')`。
3. 挂载时执行 `App.vue` 的 `<script setup>`，其中只有一句 `useRealtime()`：
   1. `useSessionStore()`：创建 session store。创建时同步做三件事：读 localStorage `vanmanga.kavita` 得到 Kavita 登录链接（必要时迁移旧格式）；调用 `setAdminTokenProvider(() => adminToken.value)`，让 `api/http.ts` 的请求拦截器能读到内存里的管理口令；注册对 `config.config?.kavitaEnabled` 的 `watch`（`immediate: true`）。这里提前创建 session store，就是为了让这个 watch 从一开始就生效。
   2. `useConfigStore().load()` → `GET /api/config`。
   3. `useLibraryStore().load()` → `GET /api/library`。
   4. `useQueueStore().load()` → `GET /api/download/queue`。
   这三个请求都不 `await`，同时发出，也不等 socket。
   5. `useSocket()` 取得全局唯一的 socket.io 客户端（`autoConnect: false`），`bindSocketEvents(socket)` 注册十个监听（七个业务事件 + `connect` / `disconnect` / `connect_error`），然后 `connect()` 发起连接。
   6. `onScopeDispose` 登记清理：解绑监听并 `disconnect()`（只在根组件卸载时发生，正常运行不会）。
4. 渲染 `<UApp :locale="zh_cn" :toaster="{ position: 'top-center' }">` → `AppShell` → `<RouterView />`。`AppShell` 的 setup 里创建一份 `useMangaSearch()` 状态并注册三个 watcher（DMCA、下载失败、重新打包完成的提示）。各浮层组件随 `AppShell` 一起挂载；其中 `AdminTokenDialog` 在 `onMounted` 里调用 `session.setAdminTokenPrompt(ask)`，从此 `withAdmin` 才能弹口令框。
5. 路由首次导航完成后，`/` 渲染 `LibraryView`。此时 `library.loaded` 为 false、`library.loading` 为 true，显示 12 个骨架卡片。
6. `GET /api/library` 返回后 `library.items` 被填充，`loaded` 变 true，页面换成卡片网格（或空库提示）。`GET /api/download/queue` 返回后，卡片上出现"下载中 / 排队中"叠加层，顶栏队列按钮显示数量。`GET /api/config` 返回后，Kavita 相关菜单项和设置页状态才确定。
7. socket 连上后触发 `connect`：`realtime.markConnected()`，并**再加载一次**库和队列（启动快照与连上 socket 之间推送的事件会丢，所以要重载；并发加载是安全的，见第 8 节）。若此时 `config.error` 不为空且没在加载，也重载配置。之后的变化都由 socket 事件推送。

## 2. 数据流

请求方向（用户操作 → 后端）：

```
组件（.vue）
  │  只调用组合函数或 store 动作，不直接 import api
  ▼
组合函数（useMangaActions / useMangaSearch …）  ──或──  store 动作（library.add / remove …）
  │                                                        │
  │  搜索直接调 api.searchManga                            │  需要口令的操作包在 session.withAdmin 里
  ▼                                                        ▼
src/api/endpoints.ts（一个接口一个函数）
  ▼
src/api/http.ts request()：axios 实例 baseURL '/api'、60 秒超时
  │  请求拦截器：adminProtected 时附 X-Admin-Token
  │  响应：解信封取 data；任何失败 → ApiError
  ▼
后端 NestJS /api/*（开发时经 Vite 代理到 http://localhost:5000）
```

推送方向（后端 → 界面）：

```
后端 Socket.IO 网关（七个事件）
  ▼
socket.io-client（useSocket 的单例，同源 /socket.io）
  ▼
src/socket/dispatcher.ts bindSocketEvents：事件 → store 动作
  ├─ queue_updated / download_started / download_progress → queue store
  ├─ chapter_completed / dmca_alert → library store
  ├─ download_completed → library store + queue store
  ├─ scan_completed → queue store + library.load()
  └─ connect / disconnect / connect_error → realtime store（connect 还会重载 library、queue，必要时 config）
  ▼
store 状态（Pinia，响应式）
  ▼
组件读取 store（LibraryView、MangaCard、QueueContent、AppShell 的 watcher → toast …）
```

要点：组件不监听 socket；socket 只在 `useRealtime()` 里连接一次；HTTP 只在 `src/api/` 里发。例外：`ChapterPickerDialog` 和 `SearchPanel` 直接 import `toApiError` / 类型，但不发请求。

## 3. 组件树

```
index.html #app
└─ App.vue                          （setup：useRealtime()）
   └─ UApp                          （locale zh_cn，toaster top-center）
      └─ layouts/AppShell.vue
         ├─ <header data-app-header>
         │   ├─ brand/BrandLogo.vue
         │   ├─ UInput  data-testid="topbar-search"
         │   ├─ UButton data-testid="queue-button"（有任务：渐变 "队列 N"；无任务：描边 "队列"；手机隐藏）
         │   ├─ UButton data-testid="settings-link"（to="/settings"，手机隐藏）
         │   └─ <p data-testid="offline-notice">（realtime.offline 时）
         ├─ <slot> ← RouterView
         │   ├─ "/"         views/LibraryView.vue
         │   │   ├─ library/LibraryToolbar.vue
         │   │   ├─ USkeleton ×12（首次加载）
         │   │   ├─ library/MangaCard.vue ×N（卡片视图）
         │   │   │   ├─ library/CoverImage.vue
         │   │   │   ├─ common/ProgressBar.vue（下载中）
         │   │   │   └─ library/MangaActionsMenu.vue（UDropdownMenu + UButton）
         │   │   └─ library/MangaRow.vue ×N（列表视图）
         │   │       ├─ library/CoverImage.vue
         │   │       ├─ common/ProgressBar.vue（下载中）
         │   │       └─ library/MangaActionsMenu.vue
         │   └─ "/settings" views/SettingsView.vue
         ├─ <nav data-testid="bottom-tabs">（仅手机：漫画库 / 队列 / 设置）
         ├─ search/SearchPanel.vue（UModal）
         │   └─ search/SearchResultRow.vue ×N
         │       └─ library/CoverImage.vue
         ├─ queue/QueueDrawer.vue（USlideover）
         │   └─ queue/QueueContent.vue
         │       └─ common/ProgressBar.vue
         ├─ chapters/ChapterPickerDialog.vue（UModal）
         ├─ common/ConfirmDialog.vue（UModal）
         └─ common/AdminTokenDialog.vue（UModal）
```

浮层（UModal、USlideover、UDropdownMenu 的内容）在运行时由 Nuxt UI 传送到 `<body>` 下，所以在 DOM 里不在 `AppShell` 的 `<div>` 内（`SearchPanel` 的注释正是因此把顶栏位置写到 `<html>` 上）。

## 4. 浏览器里保存的东西

### 4.1 持久保存（localStorage）

| 键 | 值的形状 | 谁写 | 谁读 | 失败处理 |
|---|---|---|---|---|
| `vanmanga.kavita`（常量 `KAVITA_STORAGE_KEY`，`stores/session.ts`） | JSON 字符串 `{"loginUrl":"<Kavita 登录链接>"}`，只有这一个字段 | `session.ts` 的 `persist()`（由 `setLoginUrl` 调用：`kavitaLogin` 成功、`kavitaLogout`、`kavita-disabled` / `kavita-refresh-failed` 失败、配置里 `kavitaEnabled === false`）；`readPersisted()` 迁移旧格式时也会改写；`removePersisted()` 删除无法使用的项 | `session.ts` 的 `readPersisted()`，只在 store 创建时读一次 | 每次读写都包在 try/catch 里；存储不可用时链接只在内存里 |
| `vanmanga.libraryView`（常量 `LIBRARY_VIEW_STORAGE_KEY`，`composables/useLibraryViewMode.ts`） | 字符串 `'cards'` 或 `'list'` | `useLibraryViewMode()` 里的 `watch(mode)` | `useLibraryViewMode()` 调用时的 `read()`；只有 `'list'` 被认作列表，其他值（包括没有）一律为 `'cards'` | try/catch；写不进去时本页仍按所选方式显示 |

注意：登录链接形如 `.../login?apiKey=...`，里面含长期有效的 Kavita `apiKey`。这是沿用旧 UI 的取舍（见 `frontend-data-layer.md`），总览文档第 7 节也列为已知限制。

### 4.2 刻意只放在内存里的东西

| 东西 | 位置 | 为什么不持久化 |
|---|---|---|
| 管理员口令 | `session.adminToken` | 代码注释："Held in memory for this page session only; never persisted"。刷新页面就要重新输入；口令框的说明文字也这样告诉用户 |
| Kavita 的 `jwt`、`refreshToken` | 不保存（`kavitaLogin` 只取 `loginUrl`） | 前端从不使用 JWT，也就没有需要刷新的东西 |
| 漫画库、队列、进度、配置 | 各 store | 每次打开页面从 HTTP 重新加载，之后由 socket 更新 |
| 库内筛选文本 | `library.filter` | 刷新后清空 |
| 搜索词、搜索结果 | `AppShell` 里那份 `useMangaSearch()` | 搜索缓存在服务端只有约 30 分钟有效，保存没有意义 |
| 浮层开关、确认框、章节选择 | `ui` store | — |
| socket 连接状态 | `realtime` store | — |

另外，`SearchPanel` 会在 `<html>` 的行内样式上写 CSS 变量 `--vm-search-top`，这只是 DOM 状态，不是存储。`ui.options.ts` 里 `colorMode: false`，所以 Nuxt UI 不会写颜色模式相关的存储（Nuxt UI 内部是否还写别的存储：未确认）。

---

## 5. 工程配置文件

### `index.html`

入口页。

- `<html lang="zh-CN" class="dark">`：固定深色。`main.css` 把调色板映射到 Nuxt UI 变量时用的选择器正是 `.dark`。
- `<meta name="theme-color" content="#191922">`：手机浏览器地址栏颜色，等于顶栏底色 `--color-vm-surface`。
- `<link rel="icon" href="/favicon.ico">`：来自 `public/favicon.ico`（沿用旧版图标）。
- `<div id="app" class="isolate">`：`isolate` 建立新的层叠上下文（Nuxt UI 文档建议的做法，让传送到 body 的浮层盖在应用上面）。
- 没有 spec。

### `vite.config.ts`

- `plugins: [vue(), ui(uiOptions)]`：Vue 单文件组件 + Nuxt UI 的 Vite 插件（纯 Vue 模式，自动导入 `U*` 组件和 `useToast` 等）。
- `resolve.alias['@']` → `./src`。
- `base: '/'`，`build.outDir: 'dist'`，`emptyOutDir: true`。后端 `ServeStaticModule` 提供的就是这个 `frontend/dist`。
- `server.port: 5173`；`server.proxy`：`/api` → `http://localhost:5000`（`changeOrigin: true`），`/socket.io` → 同一地址（`ws: true`）。所以开发时前端代码也只用同源相对路径。

### `vitest.config.ts`

- 与 `vite.config.ts` 用同样的 `vue()`、`ui(uiOptions)` 和 `@` 别名，因为组件测试里也要解析 `UApp` 等 Nuxt UI 组件。
- `test.globals: true`、`test.environment: 'jsdom'`。

### `playwright.config.ts`

- `testDir: './e2e'`；端口 `E2E_PORT`，默认 `5480`。
- `workers: 1`、`fullyParallel: false`：只有一个后端、共享状态，必须串行。
- `retries: 0`：注释说明，失败那次留下的后端和漫画库会被重试继承，重试会因为"库不干净"以错误的原因失败。
- `forbidOnly: !!process.env.CI`；CI 下 reporter 为 `list` + `html`（不自动打开），本地为 `list`。
- `use`：`baseURL http://127.0.0.1:<端口>`、`trace: 'retain-on-failure'`、`locale: 'zh-CN'`。
- 两个项目：`smoke`（匹配 `smoke.e2e.ts`，进 CI）、`screenshots`（匹配 `screenshots.e2e.ts`，生成评审截图，不进 CI）。都用 `Desktop Chrome`。
- `webServer`：`node e2e/start-backend.cjs`，就绪检查地址 `/api/config`，`reuseExistingServer: false`，超时 120 秒，环境变量 `PORT` 和 `ADMIN_TOKEN`（取自 `e2e/constants.ts`）。

### `ui.options.ts`

导出 `uiOptions`（类型从 `@nuxt/ui/vite` 的参数推出）。被 `vite.config.ts` 和 `vitest.config.ts` 共用。

- `colorMode: false`：不装颜色模式插件，深色由 `index.html` 写死。
- `ui.colors`：`primary: 'violet'`，`neutral: 'zinc'`。
- `ui.button.slots.base` 与 `ui.input.slots.base` 都加 `'rounded-full'`：按钮、输入框为胶囊形。
- `icon.clientBundle.scan: true`：构建时扫描用到的图标（lucide，来自 `@iconify-json/lucide`）打进包里，运行时不访问在线 Iconify API。

### `tsconfig.json`

应用代码的类型检查：`strict`、`moduleResolution: 'Bundler'`、`noEmit`、`types: ['node', 'vitest/globals']`；路径别名 `@/*` → `src/*`，`#build/ui/*` → `./node_modules/.nuxt-ui/ui/*`（Nuxt UI 插件生成的主题文件）。`include` 含 `src/**/*.ts|.d.ts|.vue`、`env.d.ts` 以及插件生成的 `auto-imports.d.ts`、`components.d.ts`；`exclude` 去掉 `*.spec.ts`、`*.test.ts`（所以 `vue-tsc` 不检查测试文件）。

### `tsconfig.e2e.json`

端到端脚本的类型检查：只 `include` `e2e/**/*.ts` 和 `playwright.config.ts`，`types: ['node']`。由 `npm run typecheck` 的第二段 `tsc --noEmit -p tsconfig.e2e.json` 使用。

### `env.d.ts`

引用 `vite/client` 类型，并声明 `*.vue` 模块的类型（`DefineComponent`），让 TS 能 import `.vue` 和图片资源。

### `eslint.config.js`

扁平配置（`tseslint.config(...)`）：

- 忽略：`dist/**`、`node_modules/**`、`coverage/**`、Playwright 输出（`test-results/**`、`playwright-report/**`、`blob-report/**`），以及 Nuxt UI 插件生成的 `auto-imports.d.ts`、`components.d.ts`。
- 规则集：`@eslint/js` recommended、`typescript-eslint` recommended、`eslint-plugin-vue` 的 `flat/essential`。
- `**/*.vue`：`<script lang="ts">` 用 TS 解析器；关闭 `no-undef`（未定义名字由 `vue-tsc` 负责，ESLint 看不到 Nuxt UI 的自动导入如 `useToast`）。
- 全局：浏览器全局变量；关闭 `vue/multi-word-component-names`（页面是单词名）；`@typescript-eslint/no-unused-vars` 忽略以 `_` 开头的参数和变量。
- `*.config.ts`、`*.config.js`、`e2e/**/*.ts`：Node 全局变量。
- `e2e/**/*.cjs`：CommonJS、Node 全局变量，关闭 `@typescript-eslint/no-require-imports`。

### `package.json` 脚本

| 脚本 | 命令 | 说明 |
|---|---|---|
| `dev` | `vite` | 开发服务，端口 5173，代理 `/api`、`/socket.io` |
| `build` | `vite build && vue-tsc --noEmit` | 先打包到 `dist/`，再做类型检查 |
| `preview` | `vite preview` | 预览打包结果 |
| `test` | `vitest run` | 跑一次全部单测 |
| `test:watch` | `vitest` | 监听模式 |
| `typecheck` | `vue-tsc --noEmit && tsc --noEmit -p tsconfig.e2e.json` | 应用 + 端到端脚本 |
| `lint` | `eslint . --max-warnings 0` | 有警告即失败 |
| `lint:fix` | `eslint . --fix` | |
| `test:e2e` | `playwright test --project=smoke` | 冒烟（需先构建前后端） |
| `screenshots` | `playwright test --project=screenshots` | 评审截图 |

运行依赖：`@nuxt/ui` ^4.12、`axios` ^1.7、`pinia` ^2.3、`socket.io-client` ^4.8、`tailwindcss` ^4.3、`vue` ^3.5、`vue-router` ^4.5。

---

## 6. 应用骨架

### `src/main.ts`

创建并挂载应用。没有导出。没有 spec（`App.spec.ts` 自己挂载 `App`，不经过 `main.ts`）。

- **作用**：导入 `./assets/main.css`；`createApp(App)`；依次安装 `createPinia()`、`router`（`./router` 的默认导出）、`ui`（`@nuxt/ui/vue-plugin`）；`app.mount('#app')`。
- **调用方**：`index.html` 的 `<script type="module" src="/src/main.ts">`。

### `src/App.vue`

根组件。spec：`src/App.spec.ts`（与 `AppShell` 一起测）。

- **setup**：`useRealtime()`，见第 9 节。注释："Loads config, library and queue over HTTP, then connects the socket once."
- **模板**：`<UApp :locale="zh_cn" :toaster="{ position: 'top-center' }">` 包住 `<AppShell><RouterView /></AppShell>`。`UApp` 提供 toast、浮层、提示所需的上下文；`zh_cn` 来自 `@nuxt/ui/locale`，让 Nuxt UI 自带的文字（如关闭按钮的无障碍标签）用中文；toast 出现在顶部居中。
- **调用方**：`main.ts`。

### `src/router/index.ts`

spec：`src/router/router.spec.ts`。

- **`routes: RouteRecordRaw[]`**（导出）
  - `{ path: '/', name: 'library', component: LibraryView }`
  - `{ path: '/settings', name: 'settings', component: SettingsView }`
  - `{ path: '/mainpage/:pathMatch(.*)*', redirect: '/' }`：旧版书签（`/mainpage/searchpage`、`/mainpage/mangaku` 等）落到漫画库。
  - `{ path: '/:pathMatch(.*)*', redirect: '/' }`：其他任何地址都回到 `/`。（第三条其实已被这条覆盖，单独写出是为了说明意图。）
  - **调用方**：本文件的 `createRouter`；`src/test/mount.ts → mountWithApp`（用内存历史建测试路由）；`router.spec.ts`。
- **默认导出 `router`**：`createRouter({ history: createWebHistory(), routes })`。用 HTML5 历史模式，所以后端要做单页回退（`backend/src/modules/frontend/spa-fallback.ts`）。两个页面组件是静态 import，没有按路由拆包（总览第 7 节提到主 JS 约 572 kB）。
  - **调用方**：`main.ts`。
- 页面里的跳转：`BrandLogo`（`to="/"`）、`AppShell` 的设置按钮和底部标签（`RouterLink to="/"`、`to="/settings"`）。

---

## 7. 接口层 `src/api/`

### `src/api/types.ts`

与 `docs/api-contract.md` 一一对应的类型和错误码常量。字段名就是线上的名字。没有自己的 spec（被各 spec 间接使用）。

#### 错误码分组

| 常量 / 类型 | 内容 | 用途 |
|---|---|---|
| `API_ERROR_CODES`（`as const` 数组） | 契约 §1.3 列出的全部服务端错误码，按状态分组：400 `validation-failed`、`query-required`、`bad-request`；401 `admin-token-required`、`admin-token-invalid`；403 `kavita-login-failed`、`kavita-refresh-failed`；404 `not-found`、`manga-not-found`、`unknown-source`、`thumbnail-not-found`、`kavita-disabled`；409 `manga-busy`、`already-in-library`、`duplicate`；410 `search-expired`；429 `rate-limited`；451 `dmca`；500 `delete-failed`、`internal-error`；502 `scraper-failed`、`scraper-blocked`、`kavita-unreachable` | 推出 `ApiErrorCode` 类型 |
| `ApiErrorCode` | 上面数组的元素类型 | `errors/messages.ts` 的 `KnownCode` |
| `DEFAULT_ERROR_CODES` | `unauthorized`、`forbidden`、`conflict`、`payload-too-large`：后端异常过滤器在没有专门错误码时按状态给的缺省码（与 `API_ERROR_CODES` 重叠的 `bad-request`、`not-found`、`rate-limited`、`internal-error` 不重复列） | `KnownCode`、`AnyErrorCode` |
| `CLIENT_ERROR_CODES` | `network-error`（完全没有响应：离线、后端没起、超时；或代理返回的非信封 502/503/504）、`invalid-response`（有响应但不是信封） | 同上 |
| `CANCELED_ERROR_CODE` | 字符串 `'canceled'`：调用方用 `AbortSignal` 取消了请求。不是失败，不提示用户 | `http.ts → toApiError`、`errors.ts → ApiError.isCanceled` |
| `AnyErrorCode` | 以上全部，加上 `(string & {})`：未知的服务端字符串原样保留，`http-<status>` 也落在这里 | `ApiError.error` 的类型 |

以上常量在运行时只被类型系统用到；`API_ERROR_CODES` 等数组本身在应用代码里没有被遍历（`errors/messages.ts` 只 `import type`）。

#### 信封

- `ApiSuccess<T>`：`{ code: 200; data: T }`。
- `ApiFailure`：`{ code: number; error: string; message?: string; data?: unknown }`。
- 调用方：`http.ts`。

#### 数据类型

- `Manga`：库里的一条记录。字段 `manga_id`、`manga_name`、`artist_name`、`newest_epi`、`thumbnail`（恒为 `/api/library/<encodeURIComponent(manga_id)>/thumbnail`）、`last_epi`、`last_epi_name`、`completed`、`serialization`（0 连载中 / 1 已完结）、`download_switch`（**0 = 自动更新开启，1 = 暂停**）、`add_date`、`updated_at`（unix 秒）、`source`、`kavita_url`、可选 `recent_update_date`，以及索引签名 `[extra: string]: unknown`（旧记录的未知字段原样透传，不要依赖）。
- `SearchCandidate`：搜索候选，`thumbnail` 为 `/api/scraper/<source>/search-thumbnail/<manga_id>`，只在搜索缓存有效期内可取。
- `Chapter`：`{ index（1 起）, title, url }`。
- `TaskKind`：`'full-manga' | 'redownload' | 'rezip'`。
- `TaskSummary`：`{ id, kind, mangaId?, status: 'pending' | 'running', enqueuedAt, startedAt? }`。注意是驼峰 `mangaId`（契约有意为之），rezip 任务没有 `mangaId`。
- `QueueSnapshot`：`{ active: TaskSummary | null; pending: TaskSummary[] }`。

#### 接口载荷

- `RuntimeConfig`：`{ kavitaEnabled, kavitaExposeUrl, adminRequired }`。
- `ScraperSource`：`{ name, displayName }`。
- `SubmitSign`：`'0' | '1' | '2'`（首次 / 已确认重复 / 取消）。
- `AddMangaBody`：`{ manga_id, source, submit_sign? }`。
- `AddMangaResult`：`{ status: 'added'; manga } | { status: 'cancelled' }`。
- `AlreadyInLibraryData`：`{ manga }`（409 `already-in-library` 的 `data`）。
- `DuplicateData`：`{ duplicates: string[] }`（409 `duplicate` 的 `data`）。
- `ToggleAutoUpdateResult`：`{ currentDownloadStatus: 0 | 1 }`。
- `TaskRef`：`{ taskId }`。
- `KavitaLoginResult`：`{ apiKey, jwt, refreshToken, loginUrl }`。

#### Socket 载荷

- `DownloadStartedEvent`：`{ manga_id, kind: 'full-manga' | 'redownload' }`。
- `DownloadProgressEvent`：`{ manga_id, chapters_total, chapters_done, chapters_failed }`。契约说明 `chapters_done` 是"已结束的章节数（含失败）"。
- `ChapterCompletedEvent`：`{ manga_id, chapter_index, chapter_title, last_epi, last_epi_name, updated_at }`。
- `DownloadCompletedEvent`：`{ manga_id, kind, status: 'done' | 'failed', chapters_total, chapters_failed, manga: Manga | null }`，漫画已被删除（如 DMCA）时 `manga` 为 null。
- `DmcaAlertEvent`：`{ manga_id, manga_name }`。
- `ServerToClientEvents`：七个事件名到处理函数类型的映射（`scan_completed` 无载荷）。用于 `useSocket.ts` 的 `AppSocket` 类型和 `dispatcher.ts` 的事件名类型。

### `src/api/errors.ts`

所有 api 函数 reject 的唯一错误类型。没有自己的 spec，`isCanceled` 在 `http.spec.ts` 里测。

- **`class ApiError extends Error`**
  - 构造参数：`status`（HTTP 状态，没有响应时为 0）、`error`（`AnyErrorCode`）、可选 `message`（缺省时等于 `error`）、可选 `data`。`name` 固定为 `'ApiError'`。
  - 约定：按 `error` 分支，从不按 `message` 分支；`message` 是服务端英文调试文字，不给用户看，界面文字用 `errorMessage()`。
  - **getter `isAdminTokenError`**：`error` 为 `admin-token-required` 或 `admin-token-invalid`。调用方：`stores/session.ts → withAdmin`（决定是否弹口令框）；`composables/useMangaActions.ts → remove`、`views/SettingsView.vue → rezip`（用户取消口令框后 `withAdmin` 会把最后那个 401 抛出来，这两处据此静默返回）。
  - **getter `isSearchExpired`**：`error === 'search-expired'`。应用代码未使用（`library.add` 直接比较 `err.error`）。
  - **getter `isCanceled`**：`error === 'canceled'`。调用方：`errors/messages.ts → errorMessage`（返回 `''`）；本文件的 `isCanceled()`。
  - 构造方：`api/http.ts` 的 `toApiError` 和 `request`。
- **`isApiError(value)`**：`value instanceof ApiError`。调用方：`errors/messages.ts`、`stores/library.ts → add`、`stores/session.ts → kavitaLogin / withAdmin`、`composables/useMangaActions.ts → remove`、`views/SettingsView.vue → rezip`。
- **`isCanceled(value)`**：是 `ApiError` 且 `error === 'canceled'`。调用方：`composables/useMangaSearch.ts → search`（被取消的旧搜索不写 `error`）。

### `src/api/http.ts`

唯一的 axios 实例、请求封装、错误转换。spec：`src/api/http.spec.ts`。

- **`REQUEST_TIMEOUT_MS = 60_000`**（导出）：每个请求的超时。注释说明给得宽是因为搜索和章节列表要实时抓源站（可能还要过 Cloudflare 求解器）；后端卡死时请求会以 `network-error` 结束，而不是永远挂着。调用方：本文件 `axios.create`；`http.spec.ts`。
- **`GATEWAY_STATUSES`**（内部）：`Set([502, 503, 504])`，表示"后面没有可达的后端"的代理错误。
- **`http: AxiosInstance`**（导出）：`axios.create({ baseURL: '/api', timeout: REQUEST_TIMEOUT_MS })`。同源，所以不设 `withCredentials`。调用方：本文件 `request`；测试里 `fakeServer(http)` 替换它的 adapter。
- **`ADMIN_TOKEN_HEADER = 'X-Admin-Token'`**（导出）：调用方：本文件拦截器；`api/index.ts` 再导出；spec。
- **模块扩展 `AxiosRequestConfig.adminProtected?: boolean`**：标记 🔒 请求。只有 `endpoints.ts` 的 `deleteManga` 和 `rezipLibrary` 设为 true。
- **`setAdminTokenProvider(provider | null)`**（导出）：登记"口令从哪来"的回调，传 null 清除。用回调是为了让本模块不依赖 Pinia。调用方：`stores/session.ts`（store 创建时 `setAdminTokenProvider(() => adminToken.value)`）。
- **请求拦截器**（`{ synchronous: true }`）：
  - **作用**：`config.adminProtected` 为假时原样放行；为真时调用 provider 取口令，有值才 `config.headers.set('X-Admin-Token', token)`。没有口令就不带这个头（服务端会回 `admin-token-required`）。
  - **实现说明**：设为同步拦截器，保证口令是在请求**发出的那一刻**读取的。`withAdmin` 要比较"这次尝试开始时持有的口令"和"现在的口令"，如果拦截器是异步的，读取时机会晚于 `withAdmin` 记录 `sent` 的时机，判断就不可靠。
- **`isEnvelope(body)`**（内部）：非 null 对象，且 `code` 是数字。
- **`isFailure(body)`**（内部）：是信封，且 `error` 是字符串。
- **`toApiError(err: unknown): ApiError`**（导出）：把 axios 抛出的任何东西转成 `ApiError`。调用方：本文件 `request`；`stores/library.ts → load`、`stores/queue.ts → load`、`stores/config.ts → load`、`composables/useMangaSearch.ts → search`、`components/chapters/ChapterPickerDialog.vue → load`（这些地方 catch 到的本来就是 `ApiError`，`toApiError` 在此只是保证类型，第一条规则会原样返回）。

  | 情况 | `status` | `error` | `message` | `data` |
  |---|---|---|---|---|
  | 已经是 `ApiError` | 原值 | 原值 | 原值 | 原值 |
  | axios 取消（`isCancel(err)`，`AbortSignal` 触发，包括发出前就已取消） | `0` | `canceled` | `err.message`，为空时 `'canceled'` | — |
  | axios 错误且没有响应（断网、后端没起、超时 `ECONNABORTED`） | `0` | `network-error` | axios 的英文消息 | — |
  | 有响应，响应体是失败信封（`code` 为数字且 `error` 为字符串） | HTTP 状态 | 信封里的 `error`（未知字符串也原样保留） | 信封里的 `message` | 信封里的 `data` |
  | 有响应，不是失败信封，状态为 502 / 503 / 504 | HTTP 状态 | `network-error` | axios 消息 | — |
  | 有响应，不是失败信封，其他状态（如代理返回 HTML 的 500，或只有 `code` 没有 `error` 的对象） | HTTP 状态 | `http-<状态>` | axios 消息 | — |
  | 不是 axios 错误的其他异常 | `0` | `network-error` | `Error.message` 或 `String(err)` | — |
  | （在 `request` 里）2xx，但响应体不是信封，或信封里没有 `data` 键 | `200` | `invalid-response` | `'Response is not an API envelope'` | — |

- **`request<T>(config): Promise<T>`**（导出）：
  - **作用**：`http.request(config)`；失败时 `throw toApiError(err)`；成功时检查响应体是信封且含 `data` 键，返回 `data`（`null`、`false` 等假值原样返回）；否则抛 `invalid-response`（见上表最后一行）。
  - **调用方**：`endpoints.ts` 的全部函数。

### `src/api/endpoints.ts`

每个接口一个带类型的函数。全部经 `request()`，成功时解析为信封的 `data`，失败时 reject `ApiError`。spec：`src/api/endpoints.spec.ts`。

- **`id(mangaId)`**（内部）：`encodeURIComponent(mangaId)`。`manga_id` 可能以 `-` 开头或含特殊字符，放进路径前一律编码。`source` 也单独 `encodeURIComponent`。
- 故意不封装：抓取调试接口（契约 §3.2），以及 `POST /api/kavita/refreshtoken`：前端只用 Kavita 的 `loginUrl`，从不用 JWT，没有需要刷新的东西。

| 函数 | 方法与路径 | 请求 | 解析为 | 值得注意的错误码 | 调用方 |
|---|---|---|---|---|---|
| `getConfig()` | `GET /api/config` | — | `RuntimeConfig` | 契约写"无失败分支"；只可能是客户端码 | `stores/config.ts → load` |
| `getSources()` | `GET /api/scraper/sources` | — | `ScraperSource[]` | — | 未使用（仅测试使用；搜索写死 `'dgmanga'`） |
| `searchManga(source, q, { signal? })` | `GET /api/scraper/:source/search?q=` | 查询参数 `q`；`signal` 透传给 axios | `SearchCandidate[]`（没有结果为 `[]`） | `query-required`、`unknown-source`、`scraper-failed`；`signal` 取消时 `canceled` | `composables/useMangaSearch.ts → search` |
| `searchThumbnailUrl(source, mangaId)` | （只拼地址）`/api/scraper/<source>/search-thumbnail/<id>` | — | `string` | — | 未使用（仅测试使用；候选的 `thumbnail` 字段已是这个地址） |
| `getLibrary()` | `GET /api/library` | — | `Manga[]`（加入顺序，排序在客户端做） | — | `stores/library.ts → load` |
| `addManga(body)` | `POST /api/library` | 只发 `{ manga_id, source }`，`submit_sign` 有值时才加上（首次提交不带）；调用方传的其他字段一律丢弃 | `AddMangaResult` | 400 `validation-failed`；409 `already-in-library`（`data: { manga }`）；409 `duplicate`（`data: { duplicates }`）；410 `search-expired` | `stores/library.ts → add`（组件应调用 `library.add`） |
| `libraryThumbnailUrl(mangaId)` | （只拼地址）`/api/library/<id>/thumbnail` | — | `string` | — | 未使用（仅测试使用；`Manga.thumbnail` 已是这个值） |
| `getLibraryChapters(mangaId)` | `GET /api/library/:mangaId/chapters` | — | `Chapter[]` | `manga-not-found`、`unknown-source`、`rate-limited`、`scraper-failed`、`scraper-blocked`、`dmca` | `stores/library.ts → fetchChapters` |
| `toggleAutoUpdate(mangaId)` | `POST /api/library/:mangaId/auto-update` | 无请求体 | `ToggleAutoUpdateResult` | `manga-not-found` | `stores/library.ts → toggleAutoUpdate` |
| `deleteManga(mangaId)` 🔒 | `DELETE /api/library/:mangaId` | `adminProtected: true` | `true` | 401 `admin-token-required` / `admin-token-invalid`；`manga-not-found`；409 `manga-busy`；500 `delete-failed` | `stores/library.ts → remove`（经 `withAdmin`） |
| `rezipLibrary()` 🔒 | `POST /api/library/rezip` | `adminProtected: true`，无请求体 | `TaskRef` | 401 两种 | `stores/library.ts → rezip`（经 `withAdmin`） |
| `queueDownload(mangaId)` | `POST /api/download` | `{ manga_id }` | `TaskRef` | `validation-failed`、`manga-not-found` | 未使用（仅测试使用；添加漫画后服务端自动排入全量下载） |
| `queueRedownload(mangaId, chapters)` | `POST /api/download/chapters` | `{ manga_id, chapters }` | `TaskRef` | `validation-failed`、`manga-not-found` | `stores/library.ts → redownload` |
| `getQueue()` | `GET /api/download/queue` | — | `QueueSnapshot`（不含进度） | — | `stores/queue.ts → load` |
| `getCurrentTask()` | `GET /api/download/current` | — | `TaskSummary \| null` | — | 未使用（仅测试使用） |
| `kavitaLogin(username, password)` | `POST /api/kavita/login` | `{ username, password }` | `KavitaLoginResult` | `validation-failed`、403 `kavita-login-failed`、404 `kavita-disabled`、502 `kavita-unreachable` | `stores/session.ts → kavitaLogin`（以 `apiKavitaLogin` 名字导入） |

### `src/api/manga.ts`

对 `Manga` 记录的两个按契约的读取。没有自己的 spec（排序回退在 `library.spec.ts` 里测，"自动"标记在 `MangaCard.spec.ts` 里测）。

- **`mangaUpdatedAt(m)`**：返回 `m.updated_at ?? m.add_date`（旧记录可能没有 `updated_at`）。调用方：`stores/library.ts → newestFirst`；`components/library/manga-display.ts → isRecentlyUpdated`；`MangaCard.vue`、`MangaRow.vue` 的相对时间。
- **`isAutoUpdate(m)`**：`m.download_switch === 0`（0 表示开启）。调用方：`composables/useMangaActions.ts`（`autoUpdate`）、`MangaCard.vue`、`MangaRow.vue`。

### `src/api/index.ts`

统一再导出：`endpoints` 全部、`types` 全部、`ApiError`、`isApiError`、`http`、`request`、`setAdminTokenProvider`、`ADMIN_TOKEN_HEADER`。

- 没有再导出 `isCanceled`、`toApiError`、`REQUEST_TIMEOUT_MS`。
- **调用方**：未使用。应用代码和 spec 都直接从 `@/api/endpoints`、`@/api/errors`、`@/api/http`、`@/api/types` 导入（搜索 `from '@/api'` 无结果）。

---

## 8. 状态 `src/stores/`

所有 store 都是 setup 写法（`defineStore('名字', () => {...})`）。总则：`load()` 从不抛错，失败记进 `loadError` / `error`；其他动作失败时 reject `ApiError`。

### `src/stores/library.ts`

漫画库。spec：`src/stores/library.spec.ts`。

#### 导出类型

- **`AddOutcome`**：`add()` 的结果。所有预期分支都是返回值而不是异常：
  - `{ status: 'added'; manga }`：已入库（已写进 `items`），服务端已排入全量下载；
  - `{ status: 'cancelled' }`：用户在相似标题确认里选了取消；
  - `{ status: 'already-in-library'; manga: Manga | null }`：已在库中；服务端在错误 `data` 里带了记录时为该记录（并已写回 `items`），没带时为 null；
  - `{ status: 'search-expired' }`：搜索缓存里已没有这个候选，应提供"重新搜索"。
- **`AddOptions`**：`{ confirmDuplicate(duplicates: string[]): Promise<boolean> }`，true = 仍要添加。
- 内部类型 `ChangeBody` / `LocalChange`：加载期间的本地改动记录，`{ kind: 'replace', id }` 或 `{ kind: 'patch', id, fields }`，外加版本号 `v`。

#### 状态

| 字段 | 类型 | 说明 | 读取方 |
|---|---|---|---|
| `items` | `Manga[]` | 原始列表，顺序为加入顺序（加载后为快照顺序，新增的追加在末尾） | `byId`、`sorted`；`LibraryView`（数量、空判断）；`LibraryToolbar` 的 `total` |
| `loaded` | `boolean` | 至少成功加载过一次 | `LibraryView`（`firstLoad`、`empty`） |
| `loading` | `boolean` | 任何一次 `load()` 进行中都为 true | `LibraryView`（骨架、重试按钮转圈） |
| `loadError` | `ApiError \| null` | 最近一次（最新发起的）加载的失败；成功后清空 | `LibraryView`（错误条） |
| `filter` | `string` | 库内筛选文本 | `LibraryView` 通过可写 computed 绑定到 `LibraryToolbar` |
| `dmcaAlerts` | `DmcaAlertEvent[]` | socket 报告的 DMCA 下架，等界面提示 | `AppShell` 的 watcher |

#### getter

- **`sorted`**：`[...items].sort(newestFirst)`。`newestFirst` 按 `mangaUpdatedAt` 降序，相同时按 `add_date` 降序。调用方：本文件 `visible`（组件不直接读）。
- **`visible`**：`filter` 去首尾空白、转小写；为空时等于 `sorted`；否则保留 `manga_name`、`artist_name`、`manga_id` 任一（`String(f ?? '')` 转小写后）包含该文本的项。调用方：`LibraryView`（渲染列表、"没有匹配"判断）。

#### 方法

- **`byId(mangaId)`**：在 `items` 里按 `manga_id` 查找，找不到返回 `undefined`。调用方：本文件 `patch`；`AppShell`（下载失败提示取名字）；`SearchPanel → inLibrary`；`ChapterPickerDialog`（标题、成功提示）；`QueueContent → title`。

#### 加载期间的本地改动（内部）

模块内变量：`version`（本地改动的递增版本号）、`loadSeq`（加载序号）、`inFlight`（进行中的加载数）、`changes: LocalChange[]`。

- **`record(change)`**：只在 `inFlight > 0` 时把改动连同 `v: ++version` 记进 `changes`。没有加载在进行时什么都不记（也不增加版本号），因为没有快照会覆盖它。
- **`upsert(manga)`**：记一条 `replace`；`items` 里有同 id 的就替换，没有就追加到末尾。调用方：`settle`（添加成功）、`add`（`already-in-library` 带记录）、`applyDownloadCompleted`（带记录）。
- **`removeLocal(mangaId)`**：记一条 `replace`；从 `items` 过滤掉该 id。调用方：`remove`、`applyDownloadCompleted`（`manga` 为 null）、`applyDmcaAlert`。
- **`patch(mangaId, fields)`**：记一条 `patch`；找到记录就 `Object.assign` 原地修改。找不到也会记下这条 patch（见 `merge`）。调用方：`toggleAutoUpdate`、`applyChapterCompleted`。
- **`merge(snapshot, since)`**：把一个在 `since` 时刻开始的加载拿到的快照，与此后的本地改动合并。

  **实现说明**：
  1. 遍历 `changes`，跳过 `v <= since` 的（加载开始前就有的改动，快照比它们新，以快照为准）。
  2. `replace` 类：把 id 放进 `replaced`，并删除此前为它累积的 patch。`patch` 类：只要该 id 还没被 replace，就把字段叠加到 `patches[id]` 上（后来的字段覆盖先前的）。replace 之后再来的 patch 被忽略，因为它已经原地改到了本地记录上，而 replace 的 id 本来就取本地记录。
  3. 按快照顺序输出：在 `replaced` 里的 id 取**当前本地记录**（本地已删除就不输出，所以删掉的不会从旧快照里复活）；否则取快照记录，若有 patch 就 `{ ...快照记录, ...patch }`（例如加载期间收到的 `chapter_completed` 不会被快照里旧的 `last_epi` 盖掉）。
  4. 最后把 `replaced` 里快照中没有、但本地有的记录追加到末尾（加载期间新加入的漫画保留）。
  
  对"本地没有、快照有"的漫画，加载期间收到的 patch 也会叠加到快照记录上。

#### 动作

- **`load(): Promise<void>`**
  - **作用**：`GET /api/library`。成功时 `items = merge(快照, since)`、`loaded = true`、`loadError = null`；失败时 `loadError = toApiError(err)`。从不抛错。
  - **调用方**：`composables/useRealtime.ts`（启动）；`socket/dispatcher.ts`（每次 `connect`、`scan_completed`）；`LibraryView.vue`（错误条上的"重试"）。
  - **实现说明**：
    - 开始时 `seq = ++loadSeq`、`since = version`、`inFlight += 1`、`loading = true`。
    - 响应回来后若 `seq !== loadSeq`（期间又发起了更新的加载）就直接返回，成功和失败都不应用。所以并发调用时只有**最后发起**的那次生效，旧的失败也不会盖掉新的成功。
    - `finally` 里 `inFlight -= 1`；只有降到 0 时才把 `loading` 设回 false 并清空 `changes`。所以 `loading` 在任何一次加载进行中都为 true，`changes` 在全部加载结束前一直保留（较新的加载也可能需要较早记录的改动）。
- **`add(candidate, options): Promise<AddOutcome>`**
  - **作用**：添加搜索候选。只取 `candidate.manga_id`、`candidate.source`。
  - **流程**：
    1. `POST /api/library`（不带 `submit_sign`）。成功 → `settle(result)`：`added` 时 `upsert(manga)`，返回服务端结果。
    2. 失败且 `error === 'duplicate'`：取 `err.data.duplicates`（没有则 `[]`），`await options.confirmDuplicate(names)`；用户取消 → 返回 `{ status: 'cancelled' }`，不再发请求（不发 `submit_sign: '2'`）；用户确认 → 带 `submit_sign: '1'` 重发，结果同样经 `settle`。
    3. 外层 catch（第一次或重发的失败都会到这里）：`search-expired` → `{ status: 'search-expired' }`；`already-in-library` → 取 `err.data.manga`，有则 `upsert`，返回 `{ status: 'already-in-library', manga: 记录或 null }`；其他错误（包括非 `ApiError`）原样抛出。
  - **调用方**：`components/search/SearchPanel.vue → add`（`confirmDuplicate` 用 `ui.confirm` 实现）。
- **`toggleAutoUpdate(mangaId): Promise<0 | 1>`**：`POST /api/library/:id/auto-update`，把返回的 `currentDownloadStatus` 用 `patch` 写回 `download_switch` 并返回它。调用方：`useMangaActions → toggleAutoUpdate`。
- **`fetchChapters(mangaId): Promise<Chapter[]>`**：直接返回 `api.getLibraryChapters(mangaId)`。调用方：`ChapterPickerDialog → load`。
- **`redownload(mangaId, chapters): Promise<TaskRef>`**：直接返回 `api.queueRedownload(...)`。不改本地状态（队列变化由 socket 推来）。调用方：`ChapterPickerDialog → confirm`。
- **`remove(mangaId): Promise<void>`** 🔒：`useSessionStore().withAdmin(() => api.deleteManga(mangaId))`，成功后 `removeLocal`。失败（含用户取消口令框时最后那个 401）原样 reject，记录保留。调用方：`useMangaActions → remove`。
- **`rezip(): Promise<TaskRef>`** 🔒：`useSessionStore().withAdmin(() => api.rezipLibrary())`。调用方：`SettingsView → rezip`。

#### socket 动作（只供分发器调用）

- **`applyChapterCompleted(e)`**：`patch(e.manga_id, { last_epi, last_epi_name, updated_at })`。库里没有这部漫画时不改 `items`（但加载中会记下 patch）。因为 `updated_at` 变了，`sorted` 会重新排序。调用方：`dispatcher.ts`（`chapter_completed`）。
- **`applyDownloadCompleted(e)`**：`e.manga` 有值 → `upsert`（用服务端的最终记录整条替换）；为 null（漫画已被删除，如 DMCA）→ `removeLocal(e.manga_id)`。调用方：`dispatcher.ts`（`download_completed`）。
- **`applyDmcaAlert(e)`**：`removeLocal(e.manga_id)`，并把事件推进 `dmcaAlerts`。调用方：`dispatcher.ts`（`dmca_alert`）。
- **`dismissDmcaAlert(mangaId)`**：从 `dmcaAlerts` 去掉该 id 的提示。调用方：`AppShell.vue` 的 DMCA watcher（显示 toast 后立即调用）。

**DMCA 处理全貌**：后端发现下架时已删除漫画及其目录，推送 `dmca_alert`（契约 §4）。前端 `applyDmcaAlert` 把记录从列表移除并排一条提示；`AppShell` 的 watcher 看到 `dmcaAlerts.length` 变化，为每条提示弹一个不自动消失的 warning toast（见第 13 节），然后 `dismissDmcaAlert`。若随后还收到该漫画 `manga: null` 的 `download_completed`，`removeLocal` 再执行一次也无害。

### `src/stores/queue.ts`

下载队列与进度。spec：`src/stores/queue.spec.ts`。

#### 导出类型 `DownloadProgress`

`{ mangaId, kind: 'full-manga' | 'redownload', total: number | null, done, failed }`。`total` 在收到第一条 `download_progress` 前为 null，而且可能一直收不到（没有要下的章节时，`download_started` 之后直接是 `download_completed`）。

#### 状态

| 字段 | 说明 | 读取方 |
|---|---|---|
| `active: TaskSummary \| null` | 正在运行的任务 | `count`、`activeProgress`、`isMangaBusy`、`applyProgress`；`useMangaStatus`；`QueueContent` |
| `pending: TaskSummary[]` | 等待中的任务，按执行顺序 | `count`、`isMangaBusy`；`useMangaStatus`（位次）；`QueueContent` |
| `loaded`、`loading`、`loadError` | 同 library 的语义 | 组件未读取（仅测试使用） |
| `progress: Record<string, DownloadProgress>` | 按漫画 id 记录的进度（实际上只有正在跑的那部） | `activeProgress`、`progressOf`；组件不直接读 |
| `lastCompleted: DownloadCompletedEvent \| null` | 最近一次 `download_completed` 的载荷 | `AppShell` 的下载失败 watcher |
| `lastScanCompletedAt: number \| null` | 最近一次 `scan_completed` 的 `Date.now()` | `AppShell` 的重新打包完成 watcher |

#### getter 与读取方法

- **`count`**：`(active ? 1 : 0) + pending.length`。调用方：`AppShell`（队列按钮文字、手机标签角标、无障碍标签）、`QueueDrawer`（标题）。
- **`activeProgress`**：`active.mangaId` 对应的进度；没有运行中任务、运行的是 rezip（无 `mangaId`）、或还没收到进度事件时为 null。调用方：`QueueContent`。
- **`progressOf(mangaId)`**：`progress[mangaId] ?? null`。调用方：`useMangaStatus`（下载中状态的进度）。
- **`isMangaBusy(mangaId)`**：`active.mangaId === mangaId` 或 `pending` 里有同 `mangaId` 的任务。用于在删除、重下前禁用按钮（后端删除时也会对这种情况回 409 `manga-busy`）。调用方：`useMangaActions`（`busy`）。

#### 版本记账（内部）

`version`（共享的递增计数）、`snapshotVersion`（最近一次 `queue_updated` 的版本）、`progressVersion: Map<mangaId, 版本>`（各漫画最近一次进度事件的版本）、`loadSeq`、`inFlight`。

- **`touchProgress(mangaId)`**：`progressVersion.set(mangaId, ++version)`。调用方：`applyStarted`、`applyProgress`。
- **`replace(s, keepProgress = [])`**：`active`、`pending` 换成快照；`progress` 里只保留 `keepProgress` 中的 id 和新 `active.mangaId`，其余删掉（快照里已不在运行的漫画，进度没有意义）。调用方：`load`、`applySnapshot`。

#### 动作

- **`load(): Promise<void>`**
  - **作用**：`GET /api/download/queue`。从不抛错，失败记进 `loadError`。
  - **调用方**：`useRealtime.ts`（启动）、`dispatcher.ts`（每次 `connect`）。
  - **实现说明**（与 `queue_updated` 的先后关系）：
    - 开始时记 `since = version`。
    - 响应回来后，若不是最新发起的加载（`seq !== loadSeq`）就整体丢弃。
    - 若 `snapshotVersion <= since`（加载期间**没有**收到 `queue_updated`）：应用快照，`replace(s, fresh)`，其中 `fresh` 是加载期间收到过进度事件的漫画（`progressVersion > since`），它们的进度被保留，不会因快照里暂时还没这部漫画而被删。
    - 若 `snapshotVersion > since`（加载期间收到了 `queue_updated`）：socket 推来的快照更新，HTTP 快照**不应用**。
    - 两种情况都会把 `loaded` 设为 true、清空 `loadError`。
    - `inFlight` 归零时 `loading = false`。
    - HTTP 快照不含进度，所以刷新页面后要等下一条 `download_progress` 才有数字（总览第 7 节）。
- **`applySnapshot(s)`**（`queue_updated`）：`snapshotVersion = ++version`，`replace(s)`（只保留新 active 的进度）。
- **`applyStarted(e)`**（`download_started`）：`touchProgress`；`progress[e.manga_id] = { kind: e.kind, total: null, done: 0, failed: 0 }`。这样不必等进度事件，卡片就能显示"下载中"和不确定进度条。
- **`applyProgress(e)`**（`download_progress`）：`touchProgress`；`kind` 取已有进度的 `kind`，没有时按 `active.kind === 'redownload'` 推断，否则为 `'full-manga'`；写入 `total = chapters_total`、`done = chapters_done`、`failed = chapters_failed`。没有先收到 `download_started` 也能记录。
- **`applyCompleted(e)`**（`download_completed`）：删掉该漫画的 `progressVersion` 和 `progress`，`lastCompleted = e`。
- **`applyScanCompleted()`**（`scan_completed`）：`lastScanCompletedAt = Date.now()`。
- 以上五个的调用方都是 `socket/dispatcher.ts`。

### `src/stores/session.ts`

Kavita 登录链接与管理员口令。spec：`src/stores/session.spec.ts`。

#### 模块级导出与内部函数

- **`KAVITA_STORAGE_KEY = 'vanmanga.kavita'`**（导出）：调用方：本文件；`session.spec.ts`。
- **`AdminTokenRequest`**（导出类型）：`{ reason: 'admin-token-required' | 'admin-token-invalid' }`。调用方：`AdminTokenDialog.vue`。
- **`AdminTokenPrompt`**（导出类型）：`(req) => Promise<string | null>`；返回口令则重试，返回 null 或空串表示放弃。
- **`KAVITA_CLEARING_ERRORS`**（内部）：`Set(['kavita-disabled', 'kavita-refresh-failed'])`，表示已保存的链接没用了。
- **`removePersisted()`**：try/catch 包着 `localStorage.removeItem(KAVITA_STORAGE_KEY)`。调用方：`readPersisted`。
- **`persist(loginUrl | null)`**：有值时写 `JSON.stringify({ loginUrl })`，否则删除该键；存储不可用时静默（链接只在内存里）。调用方：`setLoginUrl`、`readPersisted`。
- **`readPersisted(): string | null`**：
  - **作用**：读取已保存的登录链接。
  - **实现说明**（存储格式与旧数据迁移）：
    1. 读不了存储或没有该键 → null。
    2. `JSON.parse` 失败当作 null。
    3. 取 `loginUrl`，不是非空字符串 → `removePersisted()` 并返回 null（损坏的 JSON、没有 `loginUrl` 的对象都直接删掉）。
    4. 对象的键不止一个（旧格式：完整登录结果，含 `apiKey`、`jwt`、`refreshToken`）→ `persist(loginUrl)` 改写成只有 `{ loginUrl }`，丢弃 JWT 和刷新令牌。
    5. 返回 `loginUrl`。
  - **调用方**：store 创建时初始化 `kavitaLoginUrl`。

#### Kavita 部分

- **`kavitaLoginUrl: string | null`**：已保存的登录链接。原样打开即可让浏览器登录 Kavita，不要自己拼。调用方：`kavitaLoggedIn`；`useMangaActions`（`kavitaUrl` 的回退值）；`SettingsView → openKavita`。
- **`kavitaLoggedIn`**（computed）：`kavitaLoginUrl !== null`，含义是"保存了一个登录链接"，**不**代表 Kavita 会话仍有效。调用方：`useMangaActions`（是否显示"在 Kavita 中打开"）、`SettingsView`（已登录分支）。
- **`setLoginUrl(value)`**（内部）：`kavitaLoginUrl = value || null`，并 `persist`。
- **`kavitaLogin(username, password): Promise<void>`**：`POST /api/kavita/login`，成功则保存返回的 `loginUrl`（JWT 等丢弃）。失败时若错误码在 `KAVITA_CLEARING_ERRORS` 里就清除已保存的链接，然后原样 reject；其他失败（如 `kavita-login-failed`、`kavita-unreachable`）不动已保存的链接。调用方：`SettingsView → login`。
- **`kavitaLogout()`**：`setLoginUrl(null)`，清内存和存储。调用方：`SettingsView → logout`。
- **watch `config.config?.kavitaEnabled`**（`immediate: true`）：值为 `false` 时清除链接（服务端关掉了 Kavita）。配置还没加载（`undefined`）或加载失败时不清除。

**清除已保存链接的时机汇总**：登出；登录返回 `kavita-disabled` 或 `kavita-refresh-failed`；配置加载成功且 `kavitaEnabled === false`；读取时发现存储项不可用。

#### 管理员口令部分

- **`adminToken: string | null`**：只在内存，本页会话有效，从不持久化。store 创建时 `setAdminTokenProvider(() => adminToken.value)`，所以 🔒 请求发出时由 `http.ts` 拦截器读取它。组件不直接读（仅测试使用）。
- **`setAdminToken(token)`**：`adminToken = token || null`。调用方：应用代码未使用（仅测试使用；`withAdmin` 直接写 `adminToken.value`）。
- **`setAdminTokenPrompt(fn | null)`**：登记或注销"询问口令"的回调（模块内变量 `prompt`）。调用方：`AdminTokenDialog.vue` 的 `onMounted`（登记 `ask`）与 `onUnmounted`（传 null）。
- **`ask(reason)`**（内部）：
  - 没有打开着的询问（`pendingPrompt` 为 null）时调用 `prompt({ reason })`，结果经 `.then(t => t || null)`（空串当作取消），`.finally` 里把 `pendingPrompt` 清空；已有打开着的询问时直接返回同一个 Promise。
  - **实现说明**：后来加入的调用方**不传**自己的 reason，只等用户的答案然后各自重新判断。这样对话框里显示的原因只来自第一个打开它的调用方，不会出现与对话框不符的 reason。
- **`withAdmin<T>(op): Promise<T>`**：
  - **作用**：执行一个受保护的调用，遇 401 口令错误时询问口令并重试同一个 `op`。
  - **调用方**：`library.remove`、`library.rezip`（组件无需再包）。
  - **实现说明**（循环）：
    1. 每次尝试前记 `sent = adminToken.value`（拦截器在同一时刻读同一个值），执行 `op()`，成功就返回。
    2. 失败时，若不是 `ApiError`、不是口令错误（`isAdminTokenError`），或没有登记回调，原样抛出（没有对话框时 401 直接 reject）。
    3. 若当前 `adminToken` 不为 null 且不等于 `sent`：这期间别处已经输入了新口令（本次请求是用旧口令发出的），直接 `continue` 用新口令重试，**不弹框**。若当前为 null 而 `sent` 不为 null，说明这个口令已被别的调用方判为错误并清掉了，继续往下询问。
    4. `reason` 先取服务端给的错误码；若 `sent !== null`（发出时带了口令却被拒），立即把 `adminToken` 清为 null，`reason` 改为 `'admin-token-invalid'`。
    5. `token = await ask(reason)`；若答案等于刚被拒的 `sent`，视为同样错误，`ask('admin-token-invalid')` 再问，直到答案不同或为 null。
    6. 答案为 null（取消或空串）→ 抛出最后那个 401 `ApiError`，口令保持清除状态。否则 `adminToken = token`，回到第 1 步重试同一个 `op`。
    - 循环由用户驱动，直到成功或取消。
    - 并发：对话框打开期间其他调用遇 401 时加入同一个 `ask`（不会弹第二个框）；拿到答案后各自走第 5、6 步；取消时所有等待者一起 reject。

### `src/stores/realtime.ts`

socket 连接状态，由分发器写入。离线时数据仍走 HTTP 加载，只是没有实时更新。没有自己的 spec（在 `dispatcher.spec.ts` 里测）。

- **`connected`**：当前已连接。调用方：`offline`；`QueueContent`（连接状态点）。
- **`everConnected`**：本页会话里连上过。调用方：`offline`（组件不直接读）。
- **`realtimeError`**：最近一次 `connect_error` 的英文调试文字，**不展示**；连上后清空。调用方：`offline`。
- **`disconnectReason`**：最近一次 `disconnect` 的 socket.io 原因字符串。调用方：应用代码未读取（仅测试使用）。
- **`offline`**（computed）：`!connected && (everConnected || realtimeError !== null)`。
  - **实现说明**：首次连接尚在进行时（还没连上过、也没报过错）为 false，避免页面刚打开就闪一下"已断开"。连上后断开、或连接尝试失败过，才为 true。调用方：`AppShell`（顶栏下方的提示条）、`QueueContent`（连接状态文字）。
- **`markConnected()`**：`connected = true`、`everConnected = true`，清空 `realtimeError`、`disconnectReason`。
- **`markDisconnected(reason)`**：`connected = false`，记 `disconnectReason`。
- **`markConnectError(err)`**：`connected = false`，`realtimeError = err.message`（非 Error 时 `String(err)`）。
- 三个 `mark*` 的调用方：`socket/dispatcher.ts`（`connect`、`disconnect`、`connect_error`）。

### `src/stores/ui.ts`

全应用浮层的开关状态。组件改这些标志，`AppShell` 统一挂载浮层。spec：`src/stores/ui.spec.ts`。

- **`ConfirmRequest`**（导出类型）：`{ title; description?; items?: string[]（描述下面的列表，如相似标题）; confirmLabel; cancelLabel?; danger?（确认按钮用危险色） }`。调用方：`ConfirmDialog.vue`。
- **`searchOpen`**：搜索面板是否打开。写：`AppShell → submitSearch`（设为 true）、`SearchPanel` 的 `open` setter。读：`SearchPanel`。
- **`queueOpen`**：队列抽屉是否打开。写：`AppShell`（桌面队列按钮、手机队列标签）、`QueueDrawer` 的 `open` setter。读：`QueueDrawer`、`AppShell`（手机标签高亮）。
- **`chapterPickerFor: string | null`**：打开章节选择的漫画 id。读：`ChapterPickerDialog`。
- **`pendingConfirm`**：当前显示的确认请求（含内部的 `resolve`），或 null。读：`ConfirmDialog`。
- **`confirm(request): Promise<boolean>`**
  - **作用**：显示全局确认框；确认解析为 true，其他（取消、Esc、点遮罩、被新请求顶掉）解析为 false。
  - **调用方**：`useMangaActions → remove`（删除确认）、`SearchPanel → add`（`confirmDuplicate`）、`SettingsView → rezip`。
  - **实现说明**（Promise 的生命周期）：
    1. 若已有打开的请求，先对它 `resolve(false)`：新的请求取消旧的。
    2. 新建 Promise，内部函数 `settle(ok)`：只有当 `pendingConfirm.resolve` 仍是自己时才把 `pendingConfirm` 设回 null（防止一个迟到的旧请求关掉新请求的对话框），然后 `resolve(ok)`。重复调用 `settle` 无副作用（Promise 只解析一次）。
    3. `pendingConfirm = { ...request, resolve: settle }`，对话框随之打开。
- **`answerConfirm(ok)`**：调用当前请求的 `resolve(ok)`。调用方：`ConfirmDialog`（两个按钮、`open` setter 关闭时传 false）。
- **`openChapterPicker(mangaId)`** / **`closeChapterPicker()`**：设置 / 清空 `chapterPickerFor`。调用方：`useMangaActions → chooseChapters`；`ChapterPickerDialog`（`open` setter、提交成功后）。

### `src/stores/config.ts`

`GET /api/config` 的结果。spec：`src/stores/config.spec.ts`。

- **`config: RuntimeConfig | null`**：调用方：`session.ts` 的 watch（`config.config?.kavitaEnabled`）、`SettingsView`（是否已加载）。
- **`loading`**：调用方：`dispatcher.ts`（加载中不重复加载）。
- **`error: ApiError | null`**：调用方：`dispatcher.ts`（`connect` 时决定是否重载）、`SettingsView`（错误与重试）。
- **getter**：`kavitaEnabled`（未加载时 false；调用方 `useMangaActions`、`SettingsView`）、`kavitaExposeUrl`（未加载时 null；应用代码未使用）、`adminRequired`（未加载时 false；调用方 `SettingsView` 的"需要管理员口令。"提示）。
- **`load()`**：`loading = true`；成功写 `config`、清 `error`；失败 `error = toApiError(err)`（`config` 保留旧值）；最后 `loading = false`。从不抛错。没有并发保护（同时调用两次时后返回的覆盖先返回的）。调用方：`useRealtime.ts`（启动）、`dispatcher.ts`（`connect` 且 `error` 不为空、不在加载中）、`SettingsView`（"重试"）。

---

## 9. Socket

### `src/composables/useSocket.ts`

全应用共用的一条 socket.io 连接。spec：`src/composables/useSocket.spec.ts`。

- **`AppSocket`**（导出类型）：`Socket<ServerToClientEvents, Record<string, never>>`，服务端只推送，客户端不发任何事件。
- **`getSocket()`**（内部）：模块级单例；第一次调用时 `io('', { path: '/socket.io', autoConnect: false })`。空字符串地址 = 同源默认命名空间；开发时 Vite 代理 `/socket.io`。`autoConnect: false` 让应用根部决定何时连接。没有设 `withCredentials`。
- **`useSocket()`**：返回 `{ socket, connect, disconnect }`。
  - **`connect()`**：引用计数 `connectionCount += 1`；`socket.connected` 为假时调用 `socket.connect()`。
  - **`disconnect()`**：`connectionCount = max(0, connectionCount - 1)`；降到 0 时 `socket.disconnect()`。
  - **实现说明**：连接只在最后一个使用者断开时才关闭。断线后的重连由 socket.io-client 自己负责（默认开启自动重连），每次重连成功都会再触发 `connect` 事件。
- **调用方**：`composables/useRealtime.ts`（唯一使用者）。组件不应直接监听 socket。

### `src/socket/dispatcher.ts`

把服务端事件分发到 store。spec：`src/socket/dispatcher.spec.ts`。

- **`LIFECYCLE_EVENTS = ['connect', 'connect_error', 'disconnect']`**（导出）：用于事件名类型。调用方：本文件；spec。
- **`SocketLike`**（导出接口）：只要 `on(event, handler)`、`off(event, handler)`，测试可以传假对象。
- **`bindSocketEvents(socket): () => void`**
  - **作用**：在 `socket` 上注册下表全部监听，返回一个解绑函数（逐个 `off`）。必须在已激活的 Pinia 下调用（内部取四个 store）。
  - **调用方**：`composables/useRealtime.ts`。

  | 事件 | store 动作 |
  |---|---|
  | `connect`（首次与每次重连） | `realtime.markConnected()`；`library.load()`；`queue.load()`；若 `config.error` 不为空且 `!config.loading`，`config.load()` |
  | `disconnect`（reason） | `realtime.markDisconnected(reason)` |
  | `connect_error`（err） | `realtime.markConnectError(err)` |
  | `queue_updated` | `queue.applySnapshot`（整体替换） |
  | `download_started` | `queue.applyStarted` |
  | `download_progress` | `queue.applyProgress` |
  | `chapter_completed` | `library.applyChapterCompleted` |
  | `download_completed` | 先 `library.applyDownloadCompleted(e)`，再 `queue.applyCompleted(e)` |
  | `scan_completed` | `queue.applyScanCompleted()`；`library.load()`（重新打包可能改了目录与记录） |
  | `dmca_alert` | `library.applyDmcaAlert` |

  - **实现说明**：
    - 只处理契约 §4 的规范事件名，旧事件名（`downloading_info`、`response`、`complete_info`）故意不注册。
    - 重连后重载：断线期间错过的变化靠 `connect` 时的重载补回。首次 `connect` 也重载，因为启动时的 HTTP 快照与连上 socket 之间的事件会丢；重复加载是安全的，两个 store 只应用最新发起的那次，并保护加载期间的 socket 改动（第 8 节）。
    - 配置只在上次加载失败时重载：后端比前端晚启动时，前端能在 socket 连上后恢复。

### `src/composables/useRealtime.ts`

- **`useRealtime(): void`**
  - **作用**：根组件 setup 里调用一次。顺序：`useSessionStore()`（提前创建，使其对配置的 watch 生效）→ `config.load()`、`library.load()`、`queue.load()`（不等待、不依赖 socket）→ `useSocket()` → `bindSocketEvents(socket)` → `connect()`；`onScopeDispose` 时解绑并 `disconnect()`。
  - **调用方**：`App.vue`。
  - spec：没有单独的 spec，在 `App.spec.ts` 里测（启动加载、只连一次、卸载时解绑并断开）。

---

## 10. 其他组合函数 `src/composables/`

### `src/composables/useMangaSearch.ts`

搜索状态。不是 store，每次调用各有一份。spec：`src/composables/useMangaSearch.spec.ts`。

- **`MangaSearch`**（导出接口）：下面这些成员。`SearchPanel` 的 prop 类型就是它。
- **`useMangaSearch(source = 'dgmanga'): MangaSearch`**。调用方：`AppShell.vue`（唯一一份，传给 `SearchPanel`；顶栏输入框和面板输入框绑定同一个 `query`）。
- 成员：
  - **`query`**：输入框文字（`v-model`）。
  - **`results`**：最近一次完成的搜索结果；失败时清空。
  - **`loading`**：有搜索在进行。
  - **`error`**：最近一次搜索的失败（`ApiError`）；新搜索开始时清空。
  - **`lastQuery`**：最近一次提交的、去掉首尾空白的关键词；从未搜索过为 null。
  - **`cancel()`**：`controller?.abort()`、`controller = null`、`loading = false`。静默：被取消的请求不产生 `error`。调用方：`search` 开头；`SearchPanel` 关闭时；组件作用域结束时。
  - **`search(q = query.value)`**：从不抛错。
    1. 先 `cancel()` 上一次搜索。
    2. 去空白后为空：清空 `results` 和 `error`，不发请求，直接返回（`lastQuery` 不变）。
    3. 新建 `AbortController` 记为 `mine` 并赋给 `controller`；`lastQuery = 关键词`、`loading = true`、`error = null`。
    4. `GET /api/scraper/<source>/search?q=`，带 `mine.signal`。
    5. 成功：只有 `controller === mine` 时写 `results`。
    6. 失败：`controller !== mine`（已有更新的搜索）或 `isCanceled(err)` 时什么都不做；否则 `error = toApiError(err)`、`results = []`。
    7. `finally`：只有 `controller === mine` 时清 `controller`、`loading = false`。
    - **实现说明**（取消与过期响应）：旧请求经 `AbortSignal` 真正中止；即便旧响应已经在路上，比较 `controller !== mine` 也会把它丢掉。所以只有最新一次搜索能写 `results`、`error`、`loading`。
    - 调用方：`AppShell → submitSearch`；`SearchPanel → submit`。
  - **`research()`**：`lastQuery` 有值时 `search(lastQuery)`，否则什么都不做。调用方：`SearchPanel` 的"重新搜索"（过期横条）和"重试"（出错状态）。
- 若在组件或 effect scope 里调用（`getCurrentScope()` 有值），`onScopeDispose(cancel)`：作用域结束时中止进行中的请求。

### `src/composables/useMangaActions.ts`

卡片和列表行共用的每部漫画的操作及其提示。组件调这些，不直接调 api 或 store。没有自己的 spec（在 `MangaActionsMenu.spec.ts` 里测）。

- **`BUSY_REASON = '下载中或排队中，暂不可用'`**（导出）：菜单项禁用时的说明。调用方：`MangaActionsMenu.vue`。
- **`MangaActions`**（导出接口）：下面的成员。
- **`useMangaActions(manga: MaybeRefOrGetter<Manga>)`**：调用方：`MangaActionsMenu.vue`（传 `() => props.manga`）。
- 成员：
  - **`busy`**（computed）：`queue.isMangaBusy(id)`。
  - **`autoUpdate`**（computed）：`isAutoUpdate(manga)`。
  - **`kavitaUrl`**（computed）：`config.kavitaEnabled` 为假或 `session.kavitaLoggedIn` 为假时为 null（菜单不显示该项）；否则取 `safeExternalUrl(manga.kavita_url) ?? safeExternalUrl(session.kavitaLoginUrl)`：优先打开该系列的页面，系列链接没有或不是 http(s) 时退回登录链接；两者都不安全时为 null。
  - **`fail(err)`**（内部）：`errorMessage(err)` 非空时弹 `{ title: 文案, color: 'error' }`。
  - **`toggleAutoUpdate()`**：`library.toggleAutoUpdate(id)`；成功 toast `title: '已开启自动更新'`（新值 0）或 `'已关闭自动更新'`（新值 1），`description: 漫画名`，`color: 'success'`；失败走 `fail`。
  - **`chooseChapters()`**：`busy` 时直接返回；否则 `ui.openChapterPicker(id)`。
  - **`openInKavita()`**：`openExternal(kavitaUrl.value)`。
  - **`remove()`**：
    1. `busy` 时直接返回。
    2. `await ui.confirm({ title: '删除《名》？', description: '将从漫画库中移除，并删除已下载的文件。此操作无法撤销。', confirmLabel: '删除', danger: true })`；取消则返回，不发请求。
    3. `await library.remove(id)`（内部经 `withAdmin`，可能弹口令框）。成功 toast `{ title: '已删除', description: 名, color: 'success' }`。
    4. 失败：`isAdminTokenError` 时静默返回（用户取消了口令框）；其他走 `fail`，例如 `manga-busy` → "这部漫画正在下载或排队中，请稍后再试"，`delete-failed` → "删除下载目录失败，漫画记录已保留"。

### `src/composables/useMangaStatus.ts`

某部漫画在队列里的状态。没有自己的 spec（在 `MangaCard.spec.ts` 里测）。

- **`MangaQueueState`**（导出类型）：`{ kind: 'idle' }`、`{ kind: 'downloading'; progress: DownloadProgress | null }`（收到第一条进度前 `progress` 可能为 null）、`{ kind: 'queued'; position: number }`（在 `pending` 中的位次，1 起）。
- **`useMangaStatus(mangaId)`**：返回 computed：`queue.active.mangaId === id` → `downloading`（`progress = queue.progressOf(id)`）；否则在 `pending` 里找第一个同 id 的任务 → `queued`（`position = 下标 + 1`）；否则 `idle`。调用方：`MangaCard.vue`、`MangaRow.vue`。

### `src/composables/useRelativeTime.ts`

中文相对时间，全应用共用一个每分钟跳一次的时钟。spec：`src/composables/useRelativeTime.spec.ts`。

- **`formatRelativeTime(unixSeconds, now = Date.now()): string`**（导出）：

  | 条件（`diff = now - 时间`） | 输出 |
  |---|---|
  | `diff < 1 分钟`（包括未来时间，即时钟偏差） | `刚刚` |
  | `diff < 1 小时` | `N 分钟前`（`floor(diff / 分钟)`，1–59） |
  | `diff < 24 小时` | `N 小时前`（`floor(diff / 小时)`，1–23） |
  | 否则按**本地日历日**相差天数 `days`（两个时刻各取当天 0 点相减再除以 24 小时，`Math.round` 消除夏令时 23/25 小时的影响）：`days <= 1` | `昨天` |
  | `days < 7` | `N 天前`（2–6） |
  | `days < 14` | `上周` |
  | 其他 | `yyyy-MM-dd`（本地时间，月、日补零） |

  例子（设现在是 2026-11-15 10:00 本地时间）：
  - 09:59:30 → `刚刚`；09:15 → `45 分钟前`；
  - 2026-11-14 11:00（23 小时前）→ `23 小时前`；
  - 2026-11-14 09:00（25 小时前，相差 1 个日历日）→ `昨天`；
  - 2026-11-13 23:00（35 小时前，但相差 2 个日历日）→ `2 天前`；
  - 2026-11-09 → `6 天前`；2026-11-08 → `上周`；2026-11-02 → `上周`；2026-11-01（14 天）→ `2026-11-01`。

  调用方：本文件 `relative`；spec。
- **共享时钟**（模块级）：`now = ref(Date.now())`、`users` 计数、`timer`。
- **`useRelativeTime(): { now, relative }`**：
  - 在作用域内调用时 `users += 1`；第一个使用者到来时先把 `now` 校正为当前时间，再 `setInterval(() => now.value = Date.now(), 60_000)`；`onScopeDispose` 时 `users -= 1`，降到 0 就清掉定时器。
  - **实现说明**：几百张卡片共用一个定时器；没有组件在用时不跳。不在作用域内调用时不计数、不启动定时器，`now` 可能是旧值。
  - `relative(sec)` = `formatRelativeTime(sec, now.value)`，在模板或 computed 里读取时会随 `now` 每分钟重新计算。
  - 调用方：`MangaCard.vue`（用 `now` 和 `relative`；"新"标记也依赖 `now`，所以过期会自动消失）、`MangaRow.vue`（只用 `relative`）。

### `src/composables/useLibraryViewMode.ts`

卡片 / 列表选择。spec：`src/composables/useLibraryViewMode.spec.ts`。

- **`LibraryViewMode`**（导出类型）：`'cards' | 'list'`。调用方：`LibraryToolbar.vue`（`mode` model 的类型）。
- **`LIBRARY_VIEW_STORAGE_KEY = 'vanmanga.libraryView'`**（导出）。
- **`read()`**（内部）：存储值为 `'list'` 时返回 `'list'`，其他一律 `'cards'`；读不了存储时 `'cards'`。
- **`useLibraryViewMode(): Ref<LibraryViewMode>`**：`ref(read())`，`watch` 它，变化时 try/catch 写入存储（失败时本页仍生效）。每次调用各有一个 ref，不在多个调用之间同步。调用方：`LibraryView.vue`（唯一）。

### `src/composables/useIsMobile.ts`

是否为手机布局。没有 spec。

- **`MOBILE_QUERY = '(max-width: 767.98px)'`**（导出）：与 Tailwind 的 `md`（768px）断点一致（设计文档 §3.1）。
- **`useIsMobile(): Ref<boolean>`**：没有 `window` 或 `matchMedia` 时返回恒为 false 的 ref；否则 `matchMedia(MOBILE_QUERY)`，初值取 `matches`，监听 `change` 更新，`onScopeDispose` 时移除监听。调用方：`SearchPanel.vue`（`fullscreen` 和定位样式）。外壳的桌面 / 手机差异不用它，而是用 Tailwind 的 `md:` 类。

---

## 11. 错误文案与工具

### `src/errors/messages.ts`

错误码到中文提示的唯一映射。服务端的 `message` 是英文调试文字，从不展示。spec：`src/errors/messages.spec.ts`。

- **`ERROR_MESSAGES: Record<KnownCode, string>`**（导出，`KnownCode` = 服务端码 + 缺省码 + 客户端码）：

  | 状态 | 错误码 | 中文文案 |
  |---|---|---|
  | 400 | `validation-failed` | 请求参数不正确 |
  | 400 | `query-required` | 请输入搜索关键词 |
  | 400 | `bad-request` | 请求无效 |
  | 401 | `admin-token-required` | 此操作需要管理员口令 |
  | 401 | `admin-token-invalid` | 管理员口令不正确 |
  | 401 | `unauthorized` | 未授权的请求 |
  | 403 | `kavita-login-failed` | Kavita 用户名或密码错误 |
  | 403 | `kavita-refresh-failed` | Kavita 登录已失效，请重新登录 |
  | 403 | `forbidden` | 没有权限执行此操作 |
  | 404 | `not-found` | 请求的资源不存在 |
  | 404 | `manga-not-found` | 漫画库中没有这部漫画 |
  | 404 | `unknown-source` | 不支持的漫画源 |
  | 404 | `thumbnail-not-found` | 封面不存在或已过期 |
  | 404 | `kavita-disabled` | 服务器未配置 Kavita |
  | 409 | `manga-busy` | 这部漫画正在下载或排队中，请稍后再试 |
  | 409 | `already-in-library` | 这部漫画已在库中 |
  | 409 | `duplicate` | 库中已有名字相近的漫画 |
  | 409 | `conflict` | 操作冲突，请刷新后重试 |
  | 410 | `search-expired` | 搜索结果已过期，请重新搜索 |
  | 413 | `payload-too-large` | 提交的内容过大 |
  | 429 | `rate-limited` | 源站限流，请稍后再试 |
  | 451 | `dmca` | 该漫画已因 DMCA 被源站下架 |
  | 500 | `delete-failed` | 删除下载目录失败，漫画记录已保留 |
  | 500 | `internal-error` | 服务器内部错误 |
  | 502 | `scraper-failed` | 抓取源站失败，请稍后再试 |
  | 502 | `scraper-blocked` | 源站拦截了请求（Cloudflare），请稍后再试 |
  | 502 | `kavita-unreachable` | 无法连接 Kavita |
  | 客户端 | `network-error` | 无法连接服务器，请检查网络 |
  | 客户端 | `invalid-response` | 服务器返回了无法识别的内容 |

  `canceled` 和 `http-<状态>` 不在表里，由 `errorMessage` 的规则处理。调用方：本文件；`AdminTokenDialog.vue`（直接取 `ERROR_MESSAGES['admin-token-invalid']`）。
- **`FALLBACK_MESSAGE = '操作失败，请稍后重试'`**（导出）。
- **`errorMessage(err: unknown): string`**（导出）：
  1. 不是 `ApiError` → `FALLBACK_MESSAGE`；
  2. `isCanceled` → `''`（调用方据此不显示任何东西）；
  3. 错误码在表里 → 对应文案；
  4. 否则按状态：502–504 → `network-error` 的文案；≥ 500 → `internal-error` 的文案；≥ 400 → `bad-request` 的文案；
  5. 其他（如状态 0 的未知码）→ `FALLBACK_MESSAGE`。
  
  例：`http-500` → "服务器内部错误"；`http-404` → "请求无效"。
  
  调用方：`useMangaActions → fail`；`SearchPanel`（添加失败 toast、搜索出错状态）；`ChapterPickerDialog`（加载出错状态、提交失败 toast）；`LibraryView`（加载失败条）；`SettingsView`（登录失败、重新打包失败、配置读取失败）。

### `src/utils/open-external.ts`

spec：`src/utils/open-external.spec.ts`。

- **`safeExternalUrl(url): string | null`**：空值 → null；`new URL(url)` 解析失败（包括相对地址）→ null；协议是 `http:` 或 `https:` 时返回原字符串，否则 null（拒绝 `javascript:`、`data:` 等）。调用方：本文件 `openExternal`；`useMangaActions`（`kavitaUrl`）。
- **`openExternal(url): boolean`**：先过 `safeExternalUrl`；不安全返回 false；否则 `window.open(safe, '_blank', 'noopener,noreferrer')` 并返回 true（新标签页拿不到本页的 `window.opener`，也不带 Referer）。调用方：`useMangaActions → openInKavita`；`SettingsView → openKavita`（返回 false 时提示"Kavita 地址无效，无法打开"）。

---

## 12. 样式 `src/assets/`

### `src/assets/main.css`

唯一定义颜色的地方。在 `main.ts` 里导入。

- `@import "tailwindcss"; @import "@nuxt/ui";`
- **调色板**（`@theme static`，生成 Tailwind 颜色工具类 `bg-vm-*`、`text-vm-*`、`border-vm-*` 等，`static` 表示即使没用到也输出变量）：

  | 变量 | 值 | 用途 |
  |---|---|---|
  | `--color-vm-bg` | `#121218` | 页面底色 |
  | `--color-vm-surface` | `#191922` | 顶栏、抽屉、浮层 |
  | `--color-vm-card` | `#1D1D28` | 卡片 |
  | `--color-vm-divider` | `#2B2B3A` | 分隔线 |
  | `--color-vm-text` | `#ECEBF5` | 正文 |
  | `--color-vm-muted` | `#8C8AA3` | 次要文字 |
  | `--color-vm-accent` | `#B9A4F5` | 文字强调（章节名等） |
  | `--color-vm-danger` | `#FF8FA3` | 危险操作 |

- **`:root`**：
  - `--vm-search-top: 57px`：顶栏底边位置（`h-14` 的 56px + 1px 边框）。这是缺省值，`SearchPanel` 打开时会量出实际值覆盖（见第 15 节）。
  - `--vm-gradient: linear-gradient(100deg, #00A4DC, #7B6FE0 55%, #AA5CC3)`：蓝 → 紫渐变。
  - `--vm-font`：系统字体栈，含 `"PingFang SC"`、`"Hiragino Sans GB"`、`"Microsoft YaHei"`、`"Noto Sans CJK SC"`。
- **Nuxt UI 设计变量映射**（选择器 `.dark`，即 `<html class="dark">`）：`--ui-bg` → bg；`--ui-bg-muted` → card；`--ui-bg-elevated` → surface；`--ui-bg-accented` → divider；`--ui-border`、`--ui-border-muted`、`--ui-border-accented` → divider；`--ui-text`、`--ui-text-highlighted`、`--ui-text-toned` → text；`--ui-text-muted`、`--ui-text-dimmed` → muted；`color-scheme: dark`。这样 Nuxt UI 组件自带的底色、边框、文字色都落在调色板上。
- `html, body`：底色 `vm-bg`、文字 `vm-text`、字体 `--vm-font`。
- **渐变的四种用法**（注释写明渐变只用于这四处：标志里的 "Manga"、主按钮、"新"标记、进度条）：
  - `.vm-gradient-text`：渐变裁剪到文字。用于 `BrandLogo` 和 `SettingsView` 关于区的 "Manga"。
  - `.vm-gradient-bg`：渐变背景。用于 `MangaCard` 的"新"标记、`ProgressBar` 的填充条。
  - `.vm-gradient-btn`：渐变背景 + `vm-text` 文字 + 无边框；`:hover:not(:disabled)` 时 `filter: brightness(1.08)`。用于主按钮：顶栏有任务时的队列按钮、搜索结果的"添加"、过期横条的"重新搜索"、确认框的非危险确认、口令框"确认"、章节选择"重新下载 n 话"、设置页"打开 Kavita"和"登录"。
- 标志里的 "Van" 用 Tailwind 的 `text-white`，不是调色板颜色（注释："the logo's "Van" is plain white, as the spec asks"）。

### 图片

- `src/assets/valiya-mark.png`：白色 Valiya 星形图标，`BrandLogo` 使用。
- `src/assets/valiya-logo.png`：完整 Valiya 字样标志（原图黑字），`SettingsView` 关于区用 `invert` 类反白显示。
- `public/favicon.ico`：网站图标，`index.html` 引用。

---

## 13. 外壳 `src/layouts/AppShell.vue`

应用框架：顶栏、手机底部标签、离线提示、全部浮层（各挂一次），以及把服务端事件转成提示。由 `App.vue` 渲染，`<RouterView />` 放在它的默认插槽里。spec：在 `src/App.spec.ts` 的 `describe('AppShell')` 里测。

### setup

- 取 `ui`、`queue`、`library`、`realtime` 四个 store 和 `useToast()`。
- **`search = useMangaSearch()`**：全应用唯一的搜索状态，同时给顶栏输入框（`query`）和 `SearchPanel`（prop `search`）。
- **`submitSearch()`**：`query` 去空白后为空则什么都不做；否则 `ui.searchOpen = true` 并 `search.search()`。调用方：顶栏 `<form @submit.prevent>`（输入框里按回车）。
- **watch `library.dmcaAlerts.length`**（`immediate: true`）：对当前所有提示（先复制一份数组）逐个弹 toast `{ title: '《名》已因 DMCA 被源站下架', description: '已从漫画库中移除', color: 'warning', duration: 0 }`，并 `library.dismissDmcaAlert(id)`。`duration: 0` 意在让提示不自动消失（Nuxt UI 底层的 Reka UI 对 0 不启动自动关闭计时；未在浏览器中确认）。dismiss 让长度再变一次，第二次触发时列表为空，什么都不做。
- **watch `queue.lastCompleted`**：只在 `status === 'failed'` 时弹 `{ title: '《名》下载失败', color: 'error' }`。名字依次取 `event.manga?.manga_name`、`library.byId(event.manga_id)?.manga_name`、`event.manga_id`。成功完成不提示。
- **watch `queue.lastScanCompletedAt`**：有值就弹 `{ title: '重新打包完成', color: 'success' }`。

### 模板

结构：`<div class="flex min-h-dvh flex-col">` 包住顶栏、内容、底部导航和浮层。

- **顶栏** `<header class="sticky top-0 z-40 ..." data-app-header>`（`data-app-header` 供 `SearchPanel` 测量底边）：
  - `<BrandLogo />`。
  - `<form role="search" @submit.prevent="submitSearch">` 内 `UInput`：`v-model="query"`、`icon="i-lucide-search"`、`placeholder="搜索并添加漫画…"`、`aria-label="搜索并添加漫画"`、`enterkeyhint="search"`、`:ui="{ base: 'bg-vm-card' }"`、`data-testid="topbar-search"`。桌面和手机都显示，占满剩余宽度。
  - 队列按钮（二选一，都有 `class="hidden md:inline-flex"`，即只在桌面显示，`data-testid="queue-button"`，点击 `ui.queueOpen = true`）：
    - `queue.count > 0`：`UButton class="vm-gradient-btn"`、`icon="i-lucide-download"`，文字 `队列 {{ queue.count }}`，`aria-label` 为 `队列 N（下载任务）`。
    - 否则：`color="neutral" variant="outline"`，文字 `队列`，`aria-label="队列（没有下载任务）"`。
  - 设置入口：`UButton to="/settings"`、`color="neutral" variant="ghost"`、`icon="i-lucide-settings"`、`aria-label="设置"`、`data-testid="settings-link"`，只在桌面显示。
  - **离线提示**：`realtime.offline` 为真时，在顶栏内部下方显示 `<p role="status" data-testid="offline-notice">实时连接已断开，正在重连…</p>`。因为它在 sticky 顶栏里面，顶栏会变高，所以 `SearchPanel` 要在打开时重新测量。
- **内容**：`<div class="flex-1 pb-16 md:pb-0"><slot /></div>`，手机上留出底部导航的高度。
- **手机底部导航** `<nav class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 ... md:hidden" aria-label="主导航" data-testid="bottom-tabs">`，底部加 `env(safe-area-inset-bottom)`：
  - `RouterLink to="/"`：图标 `i-lucide-library` + "漫画库"，`exact-active-class="!text-vm-text"`。
  - 队列按钮 `<button data-testid="queue-tab">`：图标 `i-lucide-download` + "队列"；`ui.queueOpen` 为真时高亮；`queue.count > 0` 时显示角标 `data-testid="queue-tab-badge"`（`bg-vm-accent`）；`aria-label` 为 `队列 N（下载任务）` 或 `队列`；点击 `ui.queueOpen = true`。
  - `RouterLink to="/settings"`：图标 `i-lucide-settings` + "设置"。
- **桌面与手机的差别**：桌面（≥ 768px）顶栏有标志、搜索框、队列按钮、设置按钮，没有底部导航；手机顶栏只剩标志和搜索框，队列和设置移到底部三个标签里。队列在两端都打开同一个 `QueueDrawer`（手机上全宽）。
- **浮层**（各挂一次）：`<SearchPanel :search="search" />`、`<QueueDrawer />`、`<ChapterPickerDialog />`、`<ConfirmDialog />`、`<AdminTokenDialog />`。

---

## 14. 页面 `src/views/`

### `src/views/LibraryView.vue`

漫画库页，路由 `/`。spec：`src/views/LibraryView.spec.ts`。

#### setup

- `library = useLibraryStore()`；`mode = useLibraryViewMode()`。
- **`filter`**：可写 computed，读写 `library.filter`（让 `v-model:filter` 能直接绑 store）。
- **`firstLoad`**：`!library.loaded && library.loading`（从未成功加载、正在加载）。
- **`failed`**：`library.loadError !== null`。
- **`empty`**：`library.loaded && library.items.length === 0`。
- **`noMatch`**：`library.items.length > 0 && library.visible.length === 0`（库不空，但筛选后没有）。

#### 模板分支

外层 `<main data-testid="library-view">`。

1. 始终显示 `<LibraryToolbar v-model:filter="filter" v-model:mode="mode" :total="library.items.length" />`（总数是全部，不是筛选后的）。
2. `failed` 时显示错误条（`role="alert"`、`data-testid="library-error"`）：图标 `i-lucide-circle-alert`，文字 `漫画库加载失败：{{ errorMessage(library.loadError) }}`，`UButton` "重试"（`:loading="library.loading"`，点击 `library.load()`）。这一块独立于下面的分支，可能与已有的列表同时出现（之前加载成功、后来重载失败时，旧列表仍显示）。
3. 下面是一个 `v-if / v-else-if` 链，按顺序取第一个成立的：
   - `firstLoad`：12 个 `USkeleton`（3:4、圆角），网格同卡片视图，`aria-busy="true"`、`aria-label="正在加载漫画库"`。
   - `empty && !failed`：`还没有漫画，在上方搜索并添加`（`data-testid="library-empty"`）。
   - `noMatch`：`没有匹配的漫画`（`data-testid="library-no-match"`）。
   - `mode === 'cards'`：卡片网格 `data-testid="library-grid"`，手机 2 列、≥ 480px 3 列、≥ `sm` 自动填充（最小 150px）；`<MangaCard v-for="m in library.visible" :key="m.manga_id" :manga="m" />`。
   - 否则：列表 `<ul data-testid="library-list">`，`<MangaRow v-for ...>`。
   
   首次加载就失败时（未加载、不在加载、`items` 为空），前三个条件都不成立，会落到空的网格或列表，页面上只有错误条。

### `src/views/SettingsView.vue`

设置页，路由 `/settings`。spec：`src/views/SettingsView.spec.ts`。

#### setup

取 `config`、`session`、`library`、`ui` 四个 store 和 `toast`。

Kavita 部分：

- `username`、`password`、`loggingIn`、`loginError`（字符串）。
- **`login()`**：用户名去空白为空或密码为空时不做任何事；`loggingIn = true`，清空 `loginError`；`await session.kavitaLogin(用户名去空白, 密码)`；成功清空密码（用户名保留）并 toast `{ title: '已登录 Kavita', color: 'success' }`；失败 `loginError = errorMessage(err)`，显示在表单里（不用 toast）；最后 `loggingIn = false`。调用方：登录表单 `@submit.prevent`。
- **`openKavita()`**：`openExternal(session.kavitaLoginUrl)`，返回 false 时 toast `{ title: 'Kavita 地址无效，无法打开', color: 'error' }`。调用方："打开 Kavita"按钮。
- **`logout()`**：`session.kavitaLogout()`，toast `{ title: '已退出 Kavita', color: 'neutral' }`。调用方："退出登录"按钮。

维护部分：

- `rezipping`。
- **`rezip()`**：
  1. `await ui.confirm({ title: '重新打包全部漫画？', description: '会在下载队列中加入一个任务，按当前命名规则重新整理并打包下载目录中的所有漫画。漫画较多时需要较长时间。', confirmLabel: '重新打包' })`；取消则返回。（确认期间 `rezipping` 还是 false。）
  2. `rezipping = true`；`await library.rezip()`（经 `withAdmin`，可能弹口令框）。
  3. 成功 toast `{ title: '已加入下载队列', description: '重新打包全部漫画', color: 'success' }`。任务完成时另由 `AppShell` 提示"重新打包完成"。
  4. 失败：`isAdminTokenError` 时静默（取消了口令框）；否则 `errorMessage` 非空就弹 error toast。
  5. 最后 `rezipping = false`。
  - 调用方："重新打包全部漫画"按钮。

#### 模板

外层 `<main data-testid="settings-view">`，标题"设置"，三个区块。

**Kavita 区块**（`data-testid="kavita-section"`），`v-if` 链：

1. `config.error && !config.config`（配置从没加载成功过）：`无法读取服务器配置：{{ errorMessage(config.error) }}` + "重试"（`config.load()`）。
2. `!config.config`（还在加载）：一条 `USkeleton`。
3. **状态一：未启用** `!config.kavitaEnabled`：`服务器未启用 Kavita`（`data-testid="kavita-disabled"`）。
4. **状态二：已登录** `session.kavitaLoggedIn`（`data-testid="kavita-logged-in"`）：绿点（实为 `bg-vm-accent`）+ `已登录 Kavita，可从漫画菜单直接打开`；`UButton class="vm-gradient-btn" icon="i-lucide-external-link"` "打开 Kavita"；`UButton color="neutral" variant="outline"` "退出登录"。
5. **状态三：未登录** 表单（`data-testid="kavita-login"`）：说明 `登录后可以从漫画菜单直接在 Kavita 中打开。`；`UInput` 用户名（`autocomplete="username"`、`data-testid="kavita-username"`）；`UInput type="password"` 密码（`autocomplete="current-password"`、`data-testid="kavita-password"`）；`loginError` 非空时 `role="alert"` 显示；提交按钮"登录"（渐变，`:loading="loggingIn"`，用户名或密码为空、或正在登录时禁用）。

**维护区块**：说明 `按当前命名规则重新整理并打包下载目录中的所有漫画。`，`config.adminRequired` 为真时追加 `需要管理员口令。`；`UButton color="neutral" variant="outline" icon="i-lucide-archive-restore"` "重新打包全部漫画"（`:loading="rezipping"`、`data-testid="rezip-button"`）。

**关于区块**：`<img :src="valiyaLogo" alt="Valiya" class="h-14 w-auto invert">`；"Van"（白色）+"Manga"（`vm-gradient-text`）+ ` · Valiya-Manga 夜镇漫画`；五条说明（漫画源为漫画狗 DogeManga；同一时间只下载一部；搜索结果来自漫画狗；开启自动更新的漫画每天检查一次；章节有问题可在菜单里选择章节重新下载）；落款 `—— Tom "Van" Wang & Kun "Alen" Qi`。

---

## 15. 组件 `src/components/`

### `src/components/brand/BrandLogo.vue`

顶栏标志。spec：`src/components/brand/BrandLogo.spec.ts`。

- 无 props。导入 `@/assets/valiya-mark.png`。
- 模板：`RouterLink to="/"`（`aria-label="VanManga 首页"`、`data-testid="brand-logo"`，键盘聚焦时用 `--ui-primary` 描边）；`<img alt="" class="h-7 w-auto">`（装饰性，名字已在 `aria-label` 里）；`<span class="text-white">Van</span><span class="vm-gradient-text">Manga</span>`。
- 调用方：`AppShell.vue` 顶栏。

### `src/components/library/LibraryToolbar.vue`

漫画库工具行。没有自己的 spec（在 `LibraryView.spec.ts` 里测）。

- **prop `total: number`**：显示 `共 {{ total }} 部 · 按最近更新`。
- **model `filter`**（`defineModel<string>('filter', { required: true })`）：绑到 `UInput`（`icon="i-lucide-filter"`、`placeholder="在库中筛选…"`、`aria-label="在库中筛选"`、`data-testid="library-filter"`）。手机上输入框排到最后一行占满宽度（`order-last w-full`），≥ `sm` 时放中间。
- **model `mode`**（`LibraryViewMode`，必填）：右侧胶囊形切换组（`role="group"`、`aria-label="显示方式"`），两个 `<button>` "卡片" / "列表"，`:aria-pressed` 反映当前值，点击直接赋值 `mode`。
- 调用方：`LibraryView.vue`。

### `src/components/library/MangaCard.vue`

卡片视图里的一张卡。spec：`src/components/library/MangaCard.spec.ts`。

- **prop `manga: Manga`**。
- setup：
  - `status = useMangaStatus(() => props.manga.manga_id)`。
  - `{ now, relative } = useRelativeTime()`。
  - `isNew = isRecentlyUpdated(manga, now.value)`（三天内有更新；随共享时钟每分钟重算）。
  - `autoUpdate = isAutoUpdate(manga)`。
  - `downloaded = manga.last_epi_name !== ''`（契约：未下载时 `last_epi_name` 为 `''`）。
- 模板（`<article data-testid="manga-card-<id>">`）：
  - 3:4 封面区：`<CoverImage :src="manga.thumbnail" :title="manga.manga_name">`。
  - 左上 `isNew` 时 `新`（`vm-gradient-bg`，`data-testid="badge-new"`）。
  - 右上 `autoUpdate` 时 `自动`（半透明底，`title="自动更新已开启"`，`data-testid="badge-auto"`）。
  - 底部叠加层（`status.kind !== 'idle'` 时，`data-testid="card-overlay"`，从下往上的渐变暗底）：
    - `downloading`：`progress.total` 有值时 `下载中 {done} / {total} 话`，否则只写 `下载中`；下面 `<ProgressBar :done="progress?.done ?? 0" :total="progress?.total ?? null">`（没有总数时为不确定状态），`label` 为 `《名》下载进度`。
    - `queued`：`排队中 · 第 {position} 位`。
  - 信息区：标题（单行截断，`title` 给全名）；`downloaded` 时 `last_epi_name`（强调色），否则 `尚未下载`；底部一行左边 `relative(mangaUpdatedAt(manga))`，右边 `<MangaActionsMenu :manga="manga">`。
  - 注意：`done` 来自 `chapters_done`，按契约它包含失败的章节。
- 调用方：`LibraryView.vue`（卡片视图）。

### `src/components/library/MangaRow.vue`

列表视图里的一行。spec：在 `MangaCard.spec.ts` 的 `describe('MangaRow')` 里测。

- **prop `manga: Manga`**。
- setup：`status = useMangaStatus(...)`；`{ relative } = useRelativeTime()`；`autoUpdate`；`updated = relative(mangaUpdatedAt(manga))`（computed）。
- 模板（`<li data-testid="manga-row-<id>">`）：
  - 小封面 `CoverImage`（宽 `w-11`，3:4）。
  - 标题（截断、`title` 给全名）。
  - 第二行：
    - `downloading`：`ProgressBar`（`max-w-48`）+ 有总数时 `{done} / {total} 话`。
    - 否则：`{artist_name} · ` + 最新章节（`last_epi_name` 非空时强调色显示，否则 `尚未下载`）；`queued` 时追加 ` · 排队中 · 第 {position} 位`。
  - 手机上的更新时间另起一行（`sm:hidden`，`data-testid="row-updated-phone"`），保证截断不会把它挤掉；≥ `sm` 时更新时间单独占一列（`hidden sm:inline`）。
  - 自动 / 手动标记：`autoUpdate` 时 `自动`（强调色边框），否则 `手动`。
  - `<MangaActionsMenu :manga="manga">`。
- 调用方：`LibraryView.vue`（列表视图）。

### `src/components/library/MangaActionsMenu.vue`

⋯ 菜单。spec：`src/components/library/MangaActionsMenu.spec.ts`。

- **prop `manga: Manga`**。
- setup：`actions = useMangaActions(() => props.manga)`；`items`（computed，`DropdownMenuItem[][]`，两组）：
  - 第一组：
    1. 自动更新开关：`autoUpdate` 为真时 `label: '关闭自动更新'`、`icon: 'i-lucide-pause'`，否则 `'开启自动更新'`、`'i-lucide-refresh-cw'`；`onSelect → actions.toggleAutoUpdate()`。从不禁用。
    2. `'选择章节重新下载'`（`i-lucide-list-checks`）：`busy` 时 `disabled`，并以 `description: BUSY_REASON` 说明原因；`onSelect → actions.chooseChapters()`。
    3. 仅当 `actions.kavitaUrl` 有值：`'在 Kavita 中打开'`（`i-lucide-external-link`），`onSelect → actions.openInKavita()`。
  - 第二组：`'删除'`（`i-lucide-trash-2`），文字和图标用 `text-vm-danger`（高亮时也保持）；`busy` 时禁用并说明原因；`onSelect → actions.remove()`。
- 模板：`<UDropdownMenu :items="items" :content="{ align: 'end' }" :ui="{ content: 'bg-vm-surface ring-vm-divider w-60' }">`，触发器为 `UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm"`，`aria-label="《名》的操作"`，`data-testid="manga-actions"`。键盘焦点管理由 Nuxt UI 负责。
- 调用方：`MangaCard.vue`、`MangaRow.vue`。

### `src/components/library/CoverImage.vue`

懒加载封面，失败时显示占位。没有自己的 spec（在 `MangaCard.spec.ts` 里测失败回退）。

- **props `src: string`、`title: string`**。
- **`failed`**：图片 `@error` 时置 true；**watch `props.src`** 变化时重置为 false（同一个组件实例换了图片地址时重新尝试）。
- **`initial`**：`Array.from(title.trim())[0] ?? '?'`，按码点取第一个字（中文和 emoji 都不会被截成半个）。
- 模板：外层 `relative overflow-hidden bg-vm-divider`（尺寸由调用方的 class 决定）。`!failed` 时 `<img loading="lazy" decoding="async" class="h-full w-full object-cover" :alt="《title》封面" data-testid="cover-img">`；否则居中显示 `initial`（`aria-hidden="true"`、`data-testid="cover-fallback"`）。
- 调用方：`MangaCard.vue`、`MangaRow.vue`、`SearchResultRow.vue`。

### `src/components/library/manga-display.ts`

"新"标记的判定。没有自己的 spec（在 `MangaCard.spec.ts` 里测三天边界）。

- **`NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000`**（导出）。
- **`isRecentlyUpdated(m, now = Date.now())`**：`now - mangaUpdatedAt(m) * 1000 <= NEW_WINDOW_MS`（按毫秒算的 72 小时，不是日历日）。调用方：`MangaCard.vue`。

### `src/components/search/SearchPanel.vue`

搜索结果与"添加到漫画库"。搜索状态由外壳持有（顶栏输入框发起搜索），本面板显示它，也可以在面板里改词再搜。关闭时取消进行中的搜索。spec：`src/components/search/SearchPanel.spec.ts`。

#### prop

- **`search: MangaSearch`**（来自 `AppShell`）。`query = props.search.query` 绑到面板内的输入框，与顶栏输入框是同一个 ref。

#### setup

- **`open`**：可写 computed，读写 `ui.searchOpen`。
- **watch `open`（关闭时）**：`props.search.cancel()`。
- **watch `open`（`immediate: true`，打开时）**：在 `document` 里找 `[data-app-header]`，取 `getBoundingClientRect().bottom`，四舍五入后写到 `document.documentElement.style` 的 `--vm-search-top`。
  - **实现说明**（定位）：桌面上面板要"挂"在 sticky 顶栏的下边缘，并且只让顶栏下方的页面变暗。顶栏高度不固定（离线提示出现时会变高），所以每次打开时测量。对话框被 Nuxt UI 传送到 `<body>` 下，不在顶栏的 DOM 里，因此把位置写到 `<html>` 上，让传送后的元素也能通过 CSS 变量读到。`main.css` 里的缺省值 57px 用于测量之前。
- **`adding: Set<string>`**（reactive）：正在添加的候选 id，用于行内按钮转圈。
- **`knownInLibrary: Set<string>`**（reactive）：服务端回 `already-in-library` 但没带记录的候选 id（这种情况 `library.items` 里没有它）。
- **`expired`**：最近一次添加遇到 `search-expired`。**watch `search.loading`**：新搜索开始时清掉 `expired`。
- **`searched`**：`lastQuery !== null`。
- **`noResults`**：搜过、不在加载、没出错、结果为空。
- **`inLibrary(c)`**：`knownInLibrary.has(id) || library.byId(id) !== undefined`。添加成功或服务端带回记录时 `library.upsert` 已把它加进 `items`，所以该行自动变成"已在库中"。
- **`submit()`**：`props.search.search()`。调用方：面板内搜索表单的提交。注意它不像 `AppShell.submitSearch` 那样拦截空词：空词时 `search()` 清空结果但不改 `lastQuery`，于是会显示"没有找到“<上次关键词>”相关的漫画"（从代码推断，未在浏览器中确认）。
- **`add(c)`**：
  1. `adding.add(id)`。
  2. `await library.add(c, { confirmDuplicate })`，其中 `confirmDuplicate(names)` = `ui.confirm({ title: '库中已有相似的漫画', description: '以下漫画与《候选名》名字相近，仍然添加吗？', items: names, confirmLabel: '仍然添加' })`。
  3. 按结果：
     - `added`：toast `{ title: '已添加《名》', description: '已开始下载', color: 'success' }`；该行随即变"已在库中"。
     - `already-in-library`：`knownInLibrary.add(id)`；toast `{ title: '这部漫画已在库中', color: 'info' }`。
     - `search-expired`：`expired = true`，显示过期横条（不弹 toast）。
     - `cancelled`：什么都不做。
  4. 其他失败：`errorMessage(err)` 非空时弹 error toast。
  5. `finally`：`adding.delete(id)`。
  - 调用方：`SearchResultRow` 的 `@add`。

#### 模板

`<UModal v-model:open="open" title="搜索并添加漫画" :fullscreen="mobile" :close="false" :ui="...">`：

- `mobile`（`useIsMobile()`）为真时全屏，内容底色 `bg-vm-surface`。
- 桌面时：遮罩 `top-(--vm-search-top)`（只盖住顶栏以下）；内容 `top-(--vm-search-top) -translate-y-0`、宽 `calc(100vw-2rem)` 最大 `max-w-5xl`、上边直角下边圆角、最大高度 `calc(100dvh - var(--vm-search-top) - 1rem)`，进出场动画为从顶部滑入 / 滑出。
- `header: 'gap-2 p-3 sm:px-4 min-h-0'`；`wrapper: 'sr-only'`：标题和描述视觉上隐藏，但仍是对话框的无障碍名称。`body: 'p-0 sm:p-0'`。
- `:close="false"`：不显示 Nuxt UI 自带的 ✕，改用自己的"关闭"按钮。Esc 和点遮罩仍能关闭（UModal 缺省行为），都会经 `open` setter 关闭并触发取消搜索。
- `#actions` 插槽：`<form role="search" @submit.prevent="submit">` 内 `UInput`（`placeholder="搜索并添加漫画…"`、`aria-label="搜索漫画"`、`autofocus`、`data-testid="search-panel-input"`）；`UButton color="neutral" variant="ghost" trailing-icon="i-lucide-x"` "关闭"（`open = false`）。
- `#body` 插槽（`data-testid="search-panel"`）：
  - `expired` 时先显示横条（`role="alert"`、`data-testid="search-expired"`）：`搜索结果已过期` + 渐变按钮"重新搜索"（`search.research()`）。它在下面的分支链之外，所以和结果列表同时出现。
  - 分支链：
    1. `loading`：5 行骨架（`aria-busy="true"`、`aria-label="正在搜索"`）。
    2. `error`：`errorMessage(error)`（危险色）+ "重试"（`search.research()`），`data-testid="search-error"`。
    3. `noResults`：`没有找到“{lastQuery}”相关的漫画`（`data-testid="search-empty"`）。
    4. `!searched`：`输入关键词后按回车搜索`。
    5. 否则：`<SearchResultRow v-for="c in results" :candidate="c" :in-library="inLibrary(c)" :adding="adding.has(c.manga_id)" @add="add(c)">`。

调用方：`AppShell.vue`。

### `src/components/search/SearchResultRow.vue`

搜索结果的一行。没有自己的 spec（在 `SearchPanel.spec.ts` 里测）。

- **props**：`candidate: SearchCandidate`、`inLibrary: boolean`、`adding: boolean`。
- **emit `add`**（无参数）。
- 模板（`<li data-testid="search-result-<id>">`）：`CoverImage`（`candidate.thumbnail`，即搜索缓存里的封面；缓存过期后会 404，届时显示首字占位）；标题（截断）；`{artist_name || '未知作者'} · {newest_epi}`（最新章节强调色）；右侧按钮：
  - `inLibrary`：禁用的描边 `UButton icon="i-lucide-check"` "已在库中"；
  - 否则：渐变 `UButton icon="i-lucide-plus"` "添加"，`:loading="adding"`、`:disabled="adding"`，`aria-label="添加《名》"`，点击 `emit('add')`。
- 调用方：`SearchPanel.vue`。

### `src/components/queue/QueueDrawer.vue`

队列容器。没有 spec。

- `open`：可写 computed，读写 `ui.queueOpen`。
- 模板：`<USlideover v-model:open="open" side="right" :title="...">`，标题为 `下载队列`，有任务时为 `下载队列 · N`；`description="只读：显示正在下载与等待中的任务"`（`ui.description: 'sr-only'`，只给读屏）；内容 `bg-vm-surface w-full max-w-none md:max-w-[360px]`：手机上全宽（等于全屏页），桌面为右侧约 360px 抽屉；`body: 'flex flex-col'`。`#body` 里放 `<QueueContent class="flex-1" />`。
- 调用方：`AppShell.vue`。

### `src/components/queue/QueueContent.vue`

队列内容，只读（后端没有取消、调序接口）。spec：`src/components/queue/QueueContent.spec.ts`。

- setup：
  - **`title(task)`**：rezip → `重新打包全部漫画`；否则库里该漫画的名字，找不到时用 `mangaId`，再没有用 `未知漫画`。
  - **`scope(task)`**：`full-manga` → `下载全部新章节`；`redownload` → `重新下载所选章节`；`rezip` → `整理下载目录`。
  - **`active`** = `queue.active`；**`progress`** = `queue.activeProgress`。
  - **`counted`**：`progress.total` 为真时 `{ done, total }`，否则 null。注释说明：数的是已结束的章节，与卡片上的数字同一口径；接口没有"正在下载哪一话"的字段，所以这里不显示章节名。
  - **`connection`**：`realtime.connected` → 点 `bg-vm-accent`、`实时连接正常`；`realtime.offline` → 点 `bg-vm-danger`、`实时连接已断开，正在重连…`；其他（首次连接中）→ 闪烁的 `bg-vm-muted` 点、`正在连接…`。
- 模板（`data-testid="queue-content"`）：
  - 没有 active 且 `pending` 为空：`当前没有下载任务`（`data-testid="queue-empty"`）。
  - 有 active（`data-testid="queue-active"`）：小标题"正在下载"；名字；有 `counted` 时 `已完成 x / y 话`，否则 `scope(active)`；非 rezip 任务显示 `ProgressBar`（`:done="progress?.done ?? 0"`、`:total="progress?.total ?? null"`、`label="《名》下载进度"`），rezip 不显示进度条。
  - 有等待任务（`data-testid="queue-pending"`）：小标题 `等待中 · N`；有序列表，每项序号（1 起）、名字、`scope`。
  - 底部连接状态（`data-testid="queue-connection"`）：彩色圆点 + 文字。
- 调用方：`QueueDrawer.vue`。

### `src/components/chapters/ChapterPickerDialog.vue`

为 `ui.chapterPickerFor` 那部漫画选择要重新下载的源站章节。spec：`src/components/chapters/ChapterPickerDialog.spec.ts`。

- setup：
  - **`mangaId`** = `ui.chapterPickerFor`；**`manga`** = `library.byId(mangaId)`。
  - **`titleName`** + **watch `[mangaId, manga_name]`**（`immediate`）：`mangaId` 有值时 `titleName = 名字 ?? id`。关闭后不清空，避免离场动画期间标题变空。
  - 状态：`chapters`、`selected: Set<number>`（按 `Chapter.index`）、`loading`、`error`、`submitting`；内部 `loadSeq`。
  - **`load()`**：没有 `mangaId` 时返回；`seq = ++loadSeq`；`loading = true`、清 `error`、清 `chapters` 和 `selected`；`await library.fetchChapters(id)`（`GET /api/library/:id/chapters`，实时抓源站，可能较慢）；只有 `seq === loadSeq` 时才写 `chapters` / `error` / `loading`。调用方：下面的 watch；出错状态的"重试"。
  - **watch `mangaId`**（`immediate`）：有值时 `load()`；变为 null（关闭）时 `loadSeq++`，让进行中的加载返回后被丢弃，不会写进下一次打开的状态。
  - **`open`**：可写 computed，`mangaId !== null`；设为 false 时 `ui.closeChapterPicker()`。
  - **`toggle(index)`**：复制 `selected` 后增删该 index 再赋回（换新 Set 以触发响应式）。
  - **`selectAll()`**：选中全部章节。**`invert()`**：选中当前未选的、取消当前已选的。
  - **`count`**：`selected.size`。
  - **`confirm()`**：没有 id 或 `count === 0` 时返回；按 `chapters` 顺序取出被选中的章节；`submitting = true`；`await library.redownload(id, picked)`（`POST /api/download/chapters`）；成功 toast `{ title: '已加入下载队列：n 话', description: 漫画名, color: 'success' }` 并 `ui.closeChapterPicker()`；失败弹 `errorMessage` 的 error toast，对话框保持打开；最后 `submitting = false`。
- 模板：`<UModal v-model:open="open" :title="《titleName》· 选择章节" description="选择要重新下载的章节">`（描述 `sr-only`；内容 `sm:max-w-2xl`；页脚两端对齐、可换行）。
  - `#body`（`data-testid="chapter-picker"`）：
    1. `loading`：18 个胶囊骨架（`aria-busy="true"`、`aria-label="正在加载章节"`）。
    2. `error`：`errorMessage(error)` + "重试"（`load()`），`data-testid="chapter-error"`。
    3. 没有章节：`源站没有章节`。
    4. 否则：可滚动（最高 `50dvh`）的章节胶囊组（`role="group"`、`aria-label="章节"`），每个是 `<button :aria-pressed :title="c.title" data-testid="chapter-chip">`，已选时强调色底，点击 `toggle(c.index)`。
  - `#footer`：左边"全选"、"反选"（没有章节时禁用）和 `已选 {count} / {chapters.length}`（`data-testid="chapter-count"`）；右边渐变按钮 `重新下载 {count} 话`（`count === 0` 或提交中禁用，`:loading="submitting"`，`data-testid="chapter-confirm"`）。
- 调用方：`AppShell.vue`（挂载）；由 `useMangaActions.chooseChapters` → `ui.openChapterPicker` 打开。

### `src/components/common/AdminTokenDialog.vue`

全局管理口令输入框，登记为 `session.setAdminTokenPrompt` 的回调。spec：`src/components/common/AdminTokenDialog.spec.ts`。

- setup：
  - **`pending: { reason, resolve } | null`**、**`token`**（输入框文字）。
  - **`ask(req): Promise<string | null>`**：若已有一个未答的请求，先让它以 null 结束；清空输入框；记下新的 `{ reason, resolve }`，对话框随之打开。（实际使用中 `session.ask` 会合并并发请求，所以不会同时来两个。）调用方：经 `setAdminTokenPrompt` 由 `session.withAdmin` 调用。
  - **`answer(value)`**：先把 `pending` 置 null（关闭对话框），再 `resolve(value)`。调用方：`submit`、"取消"按钮、`open` setter、`onUnmounted`。
  - **`submit()`**：口令去空白后非空才 `answer(口令)`。调用方：表单提交（按回车或点"确认"）。
  - **`open`**：可写 computed，`pending !== null`；设为 false（Esc、点遮罩、✕）时 `answer(null)`。
  - **`invalid`**：`pending.reason === 'admin-token-invalid'`。
  - **`onMounted`**：`session.setAdminTokenPrompt(ask)`。
  - **`onUnmounted`**：注销回调，并 `answer(null)` 让还在等的调用方以取消结束。
- 流程：确认 → 口令交给 `withAdmin` 重试；口令错 → `withAdmin` 以 `admin-token-invalid` 再次询问，框内显示错误并清空输入框；取消 → 解析为 null，`withAdmin` 抛出 401，调用方（`useMangaActions.remove`、`SettingsView.rezip`）据此静默中止。
- 模板：`<UModal v-model:open="open" title="需要管理员口令" description="此操作受管理员口令保护。口令只保存在本页面内存中，刷新后需要重新输入。">`（内容 `bg-vm-surface`，页脚右对齐）。
  - `#body`：`<form id="admin-token-form" @submit.prevent="submit">` 内 `UInput type="password" placeholder="管理员口令" aria-label="管理员口令" autofocus data-testid="admin-token-input"`；`invalid` 时 `color="error"`、`highlight`，并在下方显示 `{{ ERROR_MESSAGES['admin-token-invalid'] }}，请重新输入`（即"管理员口令不正确，请重新输入"，`role="alert"`、`data-testid="admin-token-error"`）。`reason` 为 `admin-token-required` 时不显示错误。
  - 防止浏览器或密码管理器保存口令：`autocomplete="one-time-code"`、`data-1p-ignore`（1Password）、`data-lpignore="true"`（LastPass）、`data-bwignore`（Bitwarden）。
  - `#footer`："取消"（`answer(null)`）；渐变 `UButton type="submit" form="admin-token-form"` "确认"（口令为空时禁用，`data-testid="admin-token-submit"`）。
- 调用方：`AppShell.vue`（挂载）。

### `src/components/common/ConfirmDialog.vue`

全局确认框，由 `ui.confirm()` 驱动。spec：`src/components/common/ConfirmDialog.spec.ts`。

- setup：
  - **`request`**：初值为 `ui.pendingConfirm`；**watch `ui.pendingConfirm`**：有新请求时替换。请求被回答（变 null）后不清空，所以对话框在离场动画期间不会变空白。
  - **`open`**：可写 computed，`ui.pendingConfirm !== null`；设为 false（Esc、点遮罩）时 `ui.answerConfirm(false)`。
- 模板：`<UModal v-model:open="open" :title="request?.title ?? ''" :description="request?.description" :close="false">`（不显示 ✕）。
  - `#body` 只在 `request.items` 非空时渲染：圆点列表（强调色，`data-testid="confirm-items"`），用于列出相似标题。
  - `#footer`：取消按钮（ghost，文字 `cancelLabel ?? '取消'`，`answerConfirm(false)`）；确认按钮（`data-testid="confirm-ok"`，`answerConfirm(true)`，文字 `confirmLabel`）：`danger` 时用危险色底 `bg-vm-danger text-vm-bg`，否则渐变。
- 调用方：`AppShell.vue`（挂载）。三处请求来源见 `ui.confirm`。

### `src/components/common/ProgressBar.vue`

渐变进度条。spec：在 `ConfirmDialog.spec.ts` 的 `describe('ProgressBar')` 里测。

- **props**：`done: number`、`total: number | null`、可选 `label`。
- **`percent`**：`total` 为真（非 null、非 0）时 `round(done / total * 100)` 并限制在 0–100，否则 null。
- 模板：外层 `role="progressbar"`、`aria-label`（缺省 `下载进度`）、`aria-valuemin="0"`、`aria-valuemax=total`、`aria-valuenow`（不确定时不设）、`data-testid="progress-bar"`；内层 `vm-gradient-bg`：确定时 `width: {percent}%`（300ms 过渡），不确定时固定 `w-1/3 animate-pulse`。
- 调用方：`MangaCard.vue`、`MangaRow.vue`、`QueueContent.vue`。

---

## 16. 测试辅助与端到端

### `src/test/fake-server.ts`

后端的测试替身。替换的是 axios 实例的 **adapter**（传输层），所以真实的实例、拦截器和 api 函数都照常运行。

- **`DeferredReply`**（导出接口）：`resolve(status, body)`、`networkError()`、`received`（请求真正到达"服务器"时解析，值为请求配置）。
- **`FakeServer`**（导出接口）与 **`fakeServer(instance)`**（导出）：
  - 保存原 adapter；缺省应答 `404 { code: 404, error: 'not-found' }`。
  - adapter：把每个请求记进 `requests`；先从一次性队列取应答，没有就用缺省应答；延迟应答会先触发 `onReceive`，然后与请求的 `AbortSignal` 赛跑：取消时以 axios 的 `CanceledError` 失败（所以挂起的请求也遵守取消）。
  - `settle`：`'network-error'` → 抛 `AxiosError(ERR_NETWORK)`（没有响应）；2xx → 返回响应；其他 → 抛带响应的 `AxiosError(ERR_BAD_RESPONSE)`。
  - 方法：`reply(status, body)`（改缺省应答）、`replyOnce`（排一次性应答）、`replyDeferred()`（排一个由测试稍后结算的应答）、`networkError()`（缺省改为网络错误）、`requests`、`lastRequest()`、`lastBody()`（字符串时 `JSON.parse`）、`restore()`（还原 adapter）。
- 调用方：各 store、api、组件的 spec。

### `src/test/fixtures.ts`

- **`makeManga(overrides)`**：生成一条 `Manga`，缺省 `manga_id: 'm1'`、`manga_name: 'Manga m1'`、`thumbnail` 按 id 编码、`last_epi: 1`、`last_epi_name: ''`、`download_switch: 0`、`add_date` 与 `updated_at` 为 `1_700_000_000` 等，再覆盖传入字段。
- **`makeCandidate(overrides)`**：生成一个 `SearchCandidate`，缺省 `manga_id: 'c1'`、`source: 'dgmanga'`、`thumbnail` 为搜索封面地址。
- 调用方：各 spec。

### `src/test/mount.ts`

- **`Mounted`**（导出接口）：`{ wrapper, router, pinia }`。
- **`mountWithApp(component, { props?, pinia?, path? })`**：用传入的或新建的 Pinia（并 `setActivePinia`）、基于 `routes` 的内存路由（先 `push(path ?? '/')` 并等就绪），把组件包在 `<UApp>` 里挂载，`attachTo: document.body`（这样传送到 body 的弹窗、菜单、抽屉也能在 `document.body` 里找到），最后 `flushPromises()`。可以传入预先填好数据的 Pinia。
- **`bodyText()`**：`document.body.textContent`（包括传送出去的内容）。
- **`findButton(text | RegExp)`**：在整个文档里按去空白后的文字找 `<button>`。
- **`click(el)`**：点击并等待 Vue 与挂起的 Promise 结算；元素不存在时抛错。
- **`waitForText(text)`**：用 `vi.waitFor` 等文字出现（toast 是异步挂载的）。
- 调用方：组件和页面的 spec。

### `e2e/constants.ts`

- **`ADMIN_TOKEN = 'e2e-admin-token'`**：`playwright.config.ts`（作为后端环境变量）和 `smoke.e2e.ts` 共用。

### `e2e/start-backend.cjs`

为 Playwright 启动真实的 NestJS 后端（`backend/dist`，同时托管 `frontend/dist`）。需要先在 `backend/` 和 `frontend/` 各 `npm run build`。

- 建临时目录 `vanmanga-ui-e2e-*`，设置环境变量：`NODE_ENV=test`、`PORT`（缺省 5480）、`ADMIN_TOKEN`（缺省 `e2e-admin-token`）、`LIBRARY_FILE`、`QUEUE_FILE`、`DOWNLOAD_ROOT`、`THUMBNAILS_DIR` 指向临时目录；`PYTHON_EXECUTABLE` 为当前 node、`PYTHON_CLI_SCRIPT` 为 `fake-scraper.cjs`（用后端已有的配置点替换抓取器）；清空 Kavita 与 FlareSolverr 相关变量。
- 进程退出时删除临时目录；`SIGINT` / `SIGTERM` 时正常退出以触发清理。
- `E2E_BACKEND_MAIN=1`（CI 中设置）：直接 `require('backend/dist/main.js')`，走生产入口。否则像后端 e2e 测试那样手动 `NestFactory.create(AppModule)` + `configureApp`，不挂 Swagger。注释说明原因：`main.js` 在 Node 版本低于 `.nvmrc` 时会因 TLS 信任库检查拒绝启动，而假抓取器不做任何外部请求，这项检查在这里无关。
- 调用方：`playwright.config.ts` 的 `webServer.command`。

### `e2e/fake-scraper.cjs`

测试用的 `scrape_cli.py` 替身。参数格式 `<script> --source <src> <command> -- ...args`；等 stdin 结束后在 stdout 输出一行 JSON。

- `search`：参数为 `nothing` 时返回 `{ ok: false, errorCode: 457 }`（模拟源站"无结果"）；否则返回四个固定候选（`-ui1` 测试漫画一、`ui2` 星之彼端、`ui3` 超长名字、`ui4` 夜镇物语），封面是一个 1×1 PNG 的 base64。
- `metadata` / `chapters`：只有 `ui2` 有三章，其他漫画没有章节（所以整部下载立即结束；冒烟用 `-ui1`）。
- `chapter-images`：第 1 章 0.8 秒后失败（进度变成 1/3），其他章节挂 600 秒，让截图能拍到"下载中"和排队。
- 其他命令：返回不支持的错误。

### `e2e/smoke.e2e.ts`（项目 `smoke`，进 CI）

一条用例："search, add, then delete a manga with the admin token"：

1. 打开 `/`，看到 `还没有漫画，在上方搜索并添加`。
2. 顶栏搜索"测试"回车；结果行 `search-result--ui1` 出现"测试漫画一"；点"添加《测试漫画一》"；该行按钮变为禁用的"已在库中"；出现 toast `已添加《测试漫画一》`。
3. 点"关闭"；卡片 `manga-card--ui1` 出现，叠加层消失（空下载结束），队列按钮文字为"队列"。
4. 切到 375px 宽：库页和设置页 `scrollWidth <= 375`（没有横向滚动）；通过底部标签往返。
5. 删除：打开卡片菜单 → "删除" → 确认框含"删除已下载的文件" → 确认；口令框先输 `wrong-token`，看到"管理员口令不正确"，再输正确口令。
6. 卡片消失，回到空库提示。
7. 控制台错误和警告中，除了含 `401` 的（口令往返的预期 401），不允许有其他。

### `e2e/screenshots.e2e.ts`（项目 `screenshots`，不进 CI）

- `beforeAll`：经真实 API 搜索（填充服务端缓存），以 `submit_sign: '1'` 添加 `-ui1`、`ui2`、`ui3`，轮询队列直到 `ui2` 正在运行且 `ui3` 在等待。`ui4` 不加入，用来展示"添加"按钮。
- 对 1280px 和 375px 各拍：库（卡片）、库（列表）、搜索面板、队列、设置、⋯ 菜单，写入 `docs/review/p3b-screenshots/<名字>-<宽度>.png`；同时检查不出现横向滚动。

---

## 17. spec 文件一览

共 26 个，与被测文件同目录同名（`App.spec.ts` 同时测 `App.vue` 和 `AppShell.vue`）。

| spec 文件 | 覆盖内容 |
|---|---|
| `src/App.spec.ts` | 根组件在 `UApp` 里渲染路由页面；启动时加载配置、库、队列，不等 socket，socket 只连一次且事件分发到 store，卸载时解绑并断开；外壳的标志、搜索框、空闲时描边"队列"、有任务时渐变按钮与手机角标、离线提示、顶栏搜索打开结果面板 |
| `src/api/http.spec.ts` | 同源 `/api`；信封解包（含假值 data）；失败信封、未知错误串、非信封 `http-<status>`、取消（含发出前取消）、超时与无响应为 `network-error`、2xx 非信封为 `invalid-response`；口令头只在 🔒 请求且有口令时附加、发出时读取、只有删除和重新打包受保护；不带跨站凭据 |
| `src/api/endpoints.spec.ts` | 每个接口函数的方法、路径、请求体（`addManga` 只发精简字段、首次不带 `submit_sign`）、id 编码、`AbortSignal` 透传、封面地址构造、不封装 Kavita 刷新接口、失败时 reject 带类型的错误 |
| `src/stores/library.spec.ts` | 加载、按 `updated_at` 排序及 `add_date` 回退与并列、保留旧记录多余字段、筛选、加载失败不抛错；加载期间的删除、整条替换、patch、新增不被快照覆盖，加载前的改动不受保护，并发加载只应用最新、旧失败不盖新成功；添加流程全部分支；切换自动更新、章节、重下、删除（含口令重试与服务端拒绝）、重新打包；socket 更新 |
| `src/stores/queue.spec.ts` | 初始为空、加载与失败；加载期间的 `queue_updated` 取代加载结果，加载期间的进度不丢；并发加载只应用最新；快照整体替换；`isMangaBusy`；开始事件即有进度、进度更新、无开始事件也记录；完成清进度并记 `lastCompleted`；快照丢弃不再运行漫画的进度；rezip 无进度；扫描完成时间 |
| `src/stores/session.spec.ts` | Kavita：初始未登录、登录只保存链接、创建时恢复、旧格式迁移、其他失败保留链接、配置关闭 Kavita 时清除而启用或加载失败时保留、登录被拒、登出清存储；管理口令：只在内存且带在 🔒 请求上、新 store 里没有、`withAdmin` 的全部分支（成功直通、401 询问重试、被拒口令清除、取消、旧口令请求不弹框重试、加入已打开询问不带过时原因、答案等于被拒口令时再问、循环到取消、无回调、非 401、并发共享一个询问） |
| `src/stores/config.spec.ts` | 加载前全部为关闭或空；加载 `GET /api/config`；失败记录而不抛错 |
| `src/stores/ui.spec.ts` | `confirm` 按答案解析并关闭；新请求取消旧请求；章节选择开关 |
| `src/socket/dispatcher.spec.ts` | 七个事件各自到 store 的效果；`connect` 重载库和队列，只在配置加载失败时重载配置；三个生命周期事件写连接状态；不为旧事件名注册监听；解绑移除全部监听 |
| `src/composables/useSocket.spec.ts` | 单例；只创建一次，同源 `/socket.io`、`autoConnect` 关闭；`connect` / `disconnect` 引用计数 |
| `src/composables/useMangaSearch.spec.ts` | 去空白搜索并暴露结果、指定源、空词不发请求、加载状态、新搜索中止旧搜索并忽略迟到结果、失败记录且不留旧结果、`research` 重复上次关键词、无历史时 `research` 不做事、`cancel` 静默中止、作用域结束时中止 |
| `src/composables/useRelativeTime.spec.ts` | `formatRelativeTime` 各档位；`useRelativeTime` 按共享时钟格式化 |
| `src/composables/useLibraryViewMode.spec.ts` | 缺省卡片、恢复与保存、忽略未知存储值、存储抛错时仍可用 |
| `src/errors/messages.spec.ts` | 已知码的中文文案、从不显示服务端 `message`、未知码按状态类别兜底、未知 502/503/504 视为连接问题、取消返回空串、其他情况的通用兜底 |
| `src/utils/open-external.spec.ts` | 接受 http/https；拒绝其他协议、相对地址、格式错误；`openExternal` 带 `noopener` 打开、不打开 `javascript:` |
| `src/router/router.spec.ts` | `/` 为漫画库、`/settings` 为设置、未知地址重定向到 `/` |
| `src/components/brand/BrandLogo.spec.ts` | 星形图标、白色 "Van"、渐变 "Manga"、链接到首页 |
| `src/components/library/MangaCard.spec.ts` | 卡片：标题、最新章节、相对时间、三天内"新"及三天后消失、"自动"只在 `download_switch` 为 0 时、"尚未下载"、下载进度、首个进度前的"下载中"与不确定进度条、排队位次、封面失败时首字占位；列表行：作者、章节、自动 / 手动标记 |
| `src/components/library/MangaActionsMenu.spec.ts` | 空闲时的菜单项；忙碌时禁用删除与重下并说明原因；Kavita 项只在启用且已登录时出现、不打开非 http 链接、系列链接不安全时退回登录链接；切换自动更新；打开章节选择；确认 + 口令后删除；取消口令框静默中止；取消确认不发请求；删除失败显示中文错误 |
| `src/components/search/SearchPanel.spec.ts` | 结果列表内容；添加成功提示且该行变"已在库中"；库内已有的候选显示"已在库中"；相似标题确认后重发、取消则不添加；搜索过期时一键重搜；服务端报已在库中时标记该行；无结果；搜索出错与重试；关闭时取消进行中的搜索 |
| `src/components/queue/QueueContent.spec.ts` | 空状态；正在下载显示已完成章节与进度；等待列表的顺序与说明；连接状态 |
| `src/components/chapters/ChapterPickerDialog.spec.ts` | 加载章节，全选、反选、单选；重新下载后关闭；加载失败与重试；重下失败时对话框保持打开 |
| `src/components/common/AdminTokenDialog.spec.ts` | 询问、口令错误后可重输、直到成功；取消静默中止；空口令不提交；不让浏览器保存口令 |
| `src/components/common/ConfirmDialog.spec.ts` | 确认框显示请求内容并按所选按钮解析、取消解析为 false；`ProgressBar` 的确定百分比与无总数时的不确定状态 |
| `src/views/LibraryView.spec.ts` | 数量与按最新排序的卡片；库内筛选与无匹配；空库；切换到列表并记住；以记住的方式启动；加载失败与可用的重试 |
| `src/views/SettingsView.spec.ts` | Kavita 未启用、用户名密码登录、登录失败的行内提示、已登录时打开与退出、拒绝打开非 http 链接；确认后重新打包并询问口令、取消口令框静默中止；关于区的 Valiya 标志 |

没有专门 spec 的源文件：`main.ts`、`api/types.ts`、`api/manga.ts`、`api/index.ts`、`api/errors.ts`（`isCanceled` 在 `http.spec.ts` 里测）、`stores/realtime.ts`（在 `dispatcher.spec.ts` 里测）、`composables/useRealtime.ts`（在 `App.spec.ts` 里测）、`composables/useMangaActions.ts`（在 `MangaActionsMenu.spec.ts` 里测）、`composables/useMangaStatus.ts`、`components/library/CoverImage.vue`、`components/library/MangaRow.vue`、`components/library/manga-display.ts`（三者在 `MangaCard.spec.ts` 里测）、`components/library/LibraryToolbar.vue`（在 `LibraryView.spec.ts` 里测）、`components/search/SearchResultRow.vue`（在 `SearchPanel.spec.ts` 里测）、`components/common/ProgressBar.vue`（在 `ConfirmDialog.spec.ts` 里测）、`composables/useIsMobile.ts`、`components/queue/QueueDrawer.vue`（这两个没有找到直接针对它们的用例）。
