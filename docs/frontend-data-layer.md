# 前端数据层公共接口（P3a）

组件层只依赖本文列出的接口。接口依据 `docs/api-contract.md`；所有请求同源相对路径 `/api/...`，不使用 `/js/config.js`。

## 0. 总则

- 组件**只读 store**，不直接监听 socket。socket 在 `App.vue` 里由 `useRealtime()` 连接一次。
- 所有 api 函数失败时都 reject `ApiError`；按 `err.error` 分支，用户提示一律用 `errorMessage(err)`，**不要**展示 `err.message`（服务器英文调试文本）。
- 各 store 的 `load()` 从不 throw，失败写进 `loadError`/`error`；其他动作失败时 reject `ApiError`。

## 1. 错误

`@/api/errors`

```ts
class ApiError extends Error {
  readonly status: number;      // HTTP 状态；无响应时为 0
  readonly error: AnyErrorCode; // 契约 §1.3 的错误码，或客户端码
  readonly message: string;     // 英文调试文本，勿展示
  readonly data?: unknown;      // duplicate / already-in-library 携带
  get isAdminTokenError(): boolean; // admin-token-required | admin-token-invalid
  get isSearchExpired(): boolean;   // search-expired
}
function isApiError(v: unknown): v is ApiError;
```

客户端码：`network-error`（status 0，无响应）、`invalid-response`（2xx 但不是信封）、`http-<status>`（非信封错误体，如代理返回 HTML）。

`@/errors/messages`

```ts
const ERROR_MESSAGES: Record<KnownCode, string>; // 契约全部错误码 + 状态缺省码 + 客户端码
const FALLBACK_MESSAGE: string;
function errorMessage(err: unknown): string;     // 已知码 → 中文；未知码按 4xx/5xx 兜底
```

## 2. api 函数

`@/api`（`endpoints.ts`；类型在 `types.ts`，与契约同名）

| 函数 | 接口 |
|---|---|
| `getConfig(): Promise<RuntimeConfig>` | `GET /api/config` |
| `getSources(): Promise<ScraperSource[]>` | `GET /api/scraper/sources` |
| `searchManga(source, q): Promise<SearchCandidate[]>` | `GET /api/scraper/:source/search` |
| `searchThumbnailUrl(source, mangaId): string` | 搜索封面 URL |
| `getLibrary(): Promise<Manga[]>` | `GET /api/library` |
| `addManga(body: AddMangaBody): Promise<AddMangaResult>` | `POST /api/library`（组件请用 `library.add`） |
| `libraryThumbnailUrl(mangaId): string` | 库封面 URL（`Manga.thumbnail` 已是该值） |
| `getLibraryChapters(mangaId): Promise<Chapter[]>` | `GET /api/library/:id/chapters` |
| `toggleAutoUpdate(mangaId)` | `POST /api/library/:id/auto-update` |
| `deleteManga(mangaId): Promise<true>` 🔒 | `DELETE /api/library/:id` |
| `rezipLibrary(): Promise<TaskRef>` 🔒 | `POST /api/library/rezip` |
| `queueDownload(mangaId): Promise<TaskRef>` | `POST /api/download` |
| `queueRedownload(mangaId, chapters): Promise<TaskRef>` | `POST /api/download/chapters` |
| `getQueue(): Promise<QueueSnapshot>` | `GET /api/download/queue` |
| `getCurrentTask(): Promise<TaskSummary \| null>` | `GET /api/download/current` |
| `kavitaLogin(username, password)` | `POST /api/kavita/login` |
| `kavitaRefreshToken({ jwt, refreshToken })` | `POST /api/kavita/refreshtoken` |

搜索没有对应 store（无共享状态），添加浮层直接调用 `searchManga('dgmanga', q)`。

未封装（契约注明新前端不需要）：抓取调试接口、`library/short|search|paginate`、`kavita/status`。

## 3. Store

### `useLibraryStore()` — `@/stores/library`

| 成员 | 说明 |
|---|---|
| `items: Manga[]` | 原始列表（加入顺序） |
| `loaded`, `loading: boolean`；`loadError: ApiError \| null` | |
| `filter: string` | 库内筛选文本（可 `v-model`） |
| `dmcaAlerts: DmcaAlertEvent[]` | socket 报告的 DMCA 下架，UI 提示后调用 `dismissDmcaAlert` |
| `sorted: Manga[]` | 按 `updated_at` 降序（同值按 `add_date` 降序） |
| `visible: Manga[]` | `sorted` 按 `filter` 过滤（名字/作者/id，不区分大小写） |
| `byId(id): Manga \| undefined` | |
| `load(): Promise<void>` | |
| `add(candidate: { manga_id, source }, { confirmDuplicate }): Promise<AddOutcome>` | 见下 |
| `toggleAutoUpdate(id): Promise<0 \| 1>` | 返回新的 `download_switch` 并写回记录 |
| `fetchChapters(id): Promise<Chapter[]>` | 重下选择用 |
| `redownload(id, chapters): Promise<TaskRef>` | |
| `remove(id): Promise<void>` 🔒 | 经 `session.withAdmin`；成功后从列表移除 |
| `rezip(): Promise<TaskRef>` 🔒 | 经 `session.withAdmin` |
| `dismissDmcaAlert(id)` | |
| `applyChapterCompleted / applyDownloadCompleted / applyDmcaAlert` | 仅供 socket 分发器 |

添加流程：

```ts
type AddOutcome =
  | { status: 'added'; manga: Manga }              // 已入库（已加入 items），已排入全量下载
  | { status: 'cancelled' }                        // 用户在重复确认中取消
  | { status: 'already-in-library'; manga: Manga | null } // 已在库中（items 已同步）
  | { status: 'search-expired' };                  // 搜索缓存过期 → 提示并提供"重新搜索"

interface AddOptions {
  confirmDuplicate: (duplicates: string[]) => Promise<boolean>; // true = 仍要添加
}
```

`duplicate` 时调用 `confirmDuplicate(相近名字)`；确认则自动以 `submit_sign: '1'` 重发，取消则不再请求。其他失败 reject `ApiError`。

### `useQueueStore()` — `@/stores/queue`

| 成员 | 说明 |
|---|---|
| `active: TaskSummary \| null`；`pending: TaskSummary[]` | 队列快照（执行顺序） |
| `loaded: boolean`；`loadError: ApiError \| null` | |
| `count: number` | active + pending，用于队列按钮角标 |
| `activeProgress: DownloadProgress \| null` | 运行中任务的进度 |
| `progressOf(mangaId): DownloadProgress \| null` | |
| `isMangaBusy(mangaId): boolean` | 正在下载或在队列中（删除前可用于禁用按钮） |
| `lastCompleted: DownloadCompletedEvent \| null` | 最近一次 `download_completed`（`status: 'failed'` 可提示） |
| `lastScanCompletedAt: number \| null` | 最近一次 rezip 完成时间（`Date.now()`） |
| `load(): Promise<void>` | `GET /api/download/queue` |
| `applySnapshot / applyStarted / applyProgress / applyCompleted / applyScanCompleted` | 仅供 socket 分发器 |

```ts
interface DownloadProgress {
  mangaId: string;
  kind: 'full-manga' | 'redownload';
  total: number | null; // 未收到 download_progress 前为 null（可能一直收不到）
  done: number;
  failed: number;
}
```

注意：`TaskSummary` 用驼峰 `mangaId`，其他载荷用 `manga_id`（契约有意为之）。

### `useConfigStore()` — `@/stores/config`

`config: RuntimeConfig | null`，`loading`，`error: ApiError | null`，getter `kavitaEnabled`、`kavitaExposeUrl`、`adminRequired`（未加载时为 false/null），`load()`。`useRealtime()` 启动时自动加载。

### `useSessionStore()` — `@/stores/session`

Kavita：

| 成员 | 说明 |
|---|---|
| `kavita: KavitaLoginResult \| null` | 持久化到 localStorage `vanmanga.kavita` |
| `kavitaLoggedIn: boolean`；`kavitaLoginUrl: string \| null` | 自动登录直接打开 `loginUrl`，不要自己拼 |
| `kavitaLogin(username, password): Promise<void>` | 失败 reject（`kavita-login-failed` 等），状态不变 |
| `refreshKavitaToken(): Promise<void>` | `kavita-refresh-failed` 时自动登出并 reject |
| `kavitaLogout(): void` | |

管理员口令（只在内存，刷新页面即失效，从不持久化）：

| 成员 | 说明 |
|---|---|
| `adminToken: string \| null` | 有值时每个请求带 `X-Admin-Token` |
| `setAdminToken(token \| null)` | |
| `setAdminTokenPrompt(fn: AdminTokenPrompt \| null)` | 注册"询问口令"回调 |
| `withAdmin<T>(op: () => Promise<T>): Promise<T>` | 401 时询问并重试 |

### 401 口令框的接法

```ts
type AdminTokenPrompt = (req: { reason: 'admin-token-required' | 'admin-token-invalid' }) =>
  Promise<string | null>; // 返回口令则重试，返回 null 表示放弃
```

口令对话框组件在挂载时注册一次：

```ts
const session = useSessionStore();
session.setAdminTokenPrompt((req) => openTokenDialog(req.reason)); // 返回 Promise<string | null>
onUnmounted(() => session.setAdminTokenPrompt(null));
```

`withAdmin(op)`：执行 `op`；遇到 401 `admin-token-required|invalid` 调用回调，拿到口令后存入内存并重试**同一个** `op`，口令错误会再次询问（`reason: 'admin-token-invalid'`），直到成功或用户返回 `null`（此时 reject 最后那个 401 `ApiError`）。并发的多个 401 共用一个对话框。没注册回调时 401 直接 reject。`library.remove` 与 `library.rezip` 已经包好，组件无需再包。

## 4. Socket

- `useSocket()`（`@/composables/useSocket`）：单例连接，同源 `/socket.io`，引用计数的 `connect/disconnect`。
- `bindSocketEvents(socket)`（`@/socket/dispatcher`）：事件 → store 动作：

| 事件 | 动作 |
|---|---|
| `connect`（含重连） | `library.load()`、`queue.load()` |
| `queue_updated` | `queue.applySnapshot`（整体替换） |
| `download_started` | `queue.applyStarted` |
| `download_progress` | `queue.applyProgress` |
| `chapter_completed` | `library.applyChapterCompleted` |
| `download_completed` | `library.applyDownloadCompleted` + `queue.applyCompleted` |
| `scan_completed` | `queue.applyScanCompleted` + `library.load()` |
| `dmca_alert` | `library.applyDmcaAlert` |

- `useRealtime()`（`@/composables/useRealtime`）：根组件 setup 里调用一次（已在 `App.vue`）。

## 5. 测试辅助

- `@/test/fake-server`：`fakeServer(http)` 替换 axios adapter，真实拦截器与 api 函数照常运行；`reply / replyOnce / networkError / requests / lastBody`。
- `@/test/fixtures`：`makeManga()`、`makeCandidate()`。
