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
  get isCanceled(): boolean;        // canceled
}
function isApiError(v: unknown): v is ApiError;
function isCanceled(v: unknown): boolean; // ApiError 且 error === 'canceled'
```

客户端码：

- `network-error`：无响应（离线、后端没起、超时，status 0），或非信封的 502/503/504（如开发代理后面没有后端，status 保留为 502/503/504）。
- `invalid-response`：2xx 但不是信封。
- `http-<status>`：其他非信封错误体（如代理返回 HTML 的 500）。
- `canceled`：请求被调用方用 `AbortSignal` 取消（status 0）。**不是失败，不要提示用户**：先判断 `isCanceled(err)` 再处理；`errorMessage()` 对它返回 `''`。

请求超时 60 秒（`REQUEST_TIMEOUT_MS`，搜索/章节列表要实时抓取源站，所以给得宽），超时按 `network-error` 处理。axios 实例不带 `withCredentials`（同源）。

`@/errors/messages`

```ts
const ERROR_MESSAGES: Record<KnownCode, string>; // 契约全部错误码 + 状态缺省码 + 客户端码
const FALLBACK_MESSAGE: string;
function errorMessage(err: unknown): string;     // 已知码 → 中文；未知码 502–504 → 网络提示，其余按 4xx/5xx 兜底；canceled → ''
```

## 2. api 函数

`@/api`（`endpoints.ts`；类型在 `types.ts`，与契约同名）

| 函数 | 接口 |
|---|---|
| `getConfig(): Promise<RuntimeConfig>` | `GET /api/config` |
| `getSources(): Promise<ScraperSource[]>` | `GET /api/scraper/sources` |
| `searchManga(source, q, { signal? }): Promise<SearchCandidate[]>` | `GET /api/scraper/:source/search`（`signal` 取消时 reject `canceled`） |
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

🔒 = 只有这两个请求带 `X-Admin-Token`（请求配置 `adminProtected: true`，有口令时才附加；口令在发出请求的那一刻读取）。其他请求从不带口令。

未封装：抓取调试接口、`library/short|search|paginate`、`kavita/status`（契约注明新前端不需要），以及 `POST /api/kavita/refreshtoken`：前端只用 `loginUrl`，从不使用 Kavita JWT，没有需要刷新的东西（契约只提供该接口，并不要求前端调用）。

`Manga` 带索引签名 `[extra: string]: unknown`（旧记录的未知字段原样透传，不要依赖）。

### 搜索：`useMangaSearch(source = 'dgmanga')` — `@/composables/useMangaSearch`

不是 store，每次调用各有一份状态（添加浮层用）。

| 成员 | 说明 |
|---|---|
| `query: Ref<string>` | 输入框（`v-model`） |
| `results: Ref<SearchCandidate[]>` | 最近一次完成的搜索结果；失败时清空 |
| `loading: Ref<boolean>`；`error: Ref<ApiError \| null>` | |
| `lastQuery: Ref<string \| null>` | 最近一次提交的（去空白）关键词 |
| `search(q = query): Promise<void>` | 从不 throw；空关键词清空结果、不发请求；会取消上一次搜索 |
| `research(): Promise<void>` | 用 `lastQuery` 重搜（`search-expired` 后"一键重新搜索"）；没搜过则什么都不做 |
| `cancel(): void` | 静默取消进行中的搜索 |

只有最新的一次搜索能写结果：旧请求经 `AbortSignal` 取消，迟到的响应被丢弃，取消不产生 `error`。在组件/effect scope 内调用时，scope 结束会自动取消。

## 3. Store

### `useLibraryStore()` — `@/stores/library`

| 成员 | 说明 |
|---|---|
| `items: Manga[]` | 原始列表（加入顺序） |
| `loaded`, `loading: boolean`；`loadError: ApiError \| null` | `loading` 在任何一次 `load()` 进行中都为 true |
| `filter: string` | 库内筛选文本（可 `v-model`） |
| `dmcaAlerts: DmcaAlertEvent[]` | socket 报告的 DMCA 下架，UI 提示后调用 `dismissDmcaAlert` |
| `sorted: Manga[]` | 按 `updated_at ?? add_date` 降序（同值按 `add_date` 降序） |
| `visible: Manga[]` | `sorted` 按 `filter` 过滤（名字/作者/id，不区分大小写） |
| `byId(id): Manga \| undefined` | |
| `load(): Promise<void>` | 见下"加载与实时更新" |
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

`already-in-library` 的 `manga` **可能为 `null`**：服务器没在错误 `data` 里带记录时就是 `null`（此时 `items` 不变）；带了则写回 `items`。

加载与实时更新（library 与 queue 相同的保证）：

- 可以并发调用 `load()`：只应用**最后发起**的那次的结果（包括失败），更早的响应被丢弃；`loading` 直到全部结束才变 false。
- 加载进行中由 socket 或本地动作造成的改动不会被（可能更旧的）快照覆盖：library 中被 upsert/删除的 id 保留当前本地状态（删掉的不会重新出现，新加的保留），被 patch 的字段（如 `chapter_completed`）叠加在快照记录上；加载开始前的改动不受保护（快照更新）。

### `useQueueStore()` — `@/stores/queue`

| 成员 | 说明 |
|---|---|
| `active: TaskSummary \| null`；`pending: TaskSummary[]` | 队列快照（执行顺序） |
| `loaded`, `loading: boolean`；`loadError: ApiError \| null` | `loading` 在任何一次 `load()` 进行中都为 true |
| `count: number` | active + pending，用于队列按钮角标 |
| `activeProgress: DownloadProgress \| null` | 运行中任务的进度 |
| `progressOf(mangaId): DownloadProgress \| null` | |
| `isMangaBusy(mangaId): boolean` | 正在下载或在队列中（删除前可用于禁用按钮） |
| `lastCompleted: DownloadCompletedEvent \| null` | 最近一次 `download_completed`（`status: 'failed'` 可提示） |
| `lastScanCompletedAt: number \| null` | 最近一次 rezip 完成时间（`Date.now()`） |
| `load(): Promise<void>` | `GET /api/download/queue`；加载期间收到 `queue_updated` 则丢弃本次快照（socket 的更新）；期间收到进度事件的漫画保留其进度 |
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

`config: RuntimeConfig | null`，`loading`，`error: ApiError | null`，getter `kavitaEnabled`、`kavitaExposeUrl`、`adminRequired`（未加载时为 false/null），`load()`。`useRealtime()` 启动时自动加载；之后每次 socket `connect` 时若 `error` 不为空会重新加载（后端启动晚于前端时能恢复）。

### `useRealtimeStore()` — `@/stores/realtime`

socket 连接状态（由分发器写入）。离线时数据仍走 HTTP 加载，只是没有实时更新。

| 成员 | 说明 |
|---|---|
| `connected: boolean` | 当前已连接 |
| `everConnected: boolean` | 本页面会话里连上过 |
| `offline: boolean` | 显示"实时更新离线"提示用：未连接，且连上过或连接失败过（首次连接尚在进行时为 false） |
| `realtimeError: string \| null` | 最近一次 `connect_error` 的英文调试文本，**勿展示**；连上后清空 |
| `disconnectReason: string \| null` | 最近一次 `disconnect` 的 socket.io 原因 |
| `markConnected / markDisconnected / markConnectError` | 仅供 socket 分发器 |

### `useSessionStore()` — `@/stores/session`

Kavita：

| 成员 | 说明 |
|---|---|
| `kavitaLoginUrl: string \| null` | 已保存的 Kavita 登录链接，持久化到 localStorage `vanmanga.kavita`（只存 `{ loginUrl }`）。自动登录直接打开它，不要自己拼 |
| `kavitaLoggedIn: boolean` | **"保存了一个登录链接"**，不代表 Kavita 会话仍然有效 |
| `kavitaLogin(username, password): Promise<void>` | 成功则保存 `loginUrl`；失败 reject（`kavita-login-failed` 等）。`kavita-disabled` / `kavita-refresh-failed` 会同时清除已保存的链接，其他失败不动它 |
| `kavitaLogout(): void` | 清除链接与存储 |

已移除：`kavita`（完整登录结果）与 `refreshKavitaToken()`。JWT 与 refreshToken 不再保存（没有任何地方使用）。

清除已保存链接的时机：登出；`kavita-disabled` 或 `kavita-refresh-failed`；配置加载成功且 `kavitaEnabled === false`（配置加载失败不清除）。旧格式的存储项（含 `jwt`/`refreshToken` 的完整登录结果）读取时改写为 `{ loginUrl }`；无法使用的项（损坏 JSON、没有 `loginUrl`）直接删除。

注意：保存的链接里含有长期有效的 Kavita `apiKey`（链接形如 `.../login?apiKey=...`）。这是沿用旧 UI 的取舍（接受），等待项目所有者决定是否改变。

管理员口令（只在内存，刷新页面即失效，从不持久化）：

| 成员 | 说明 |
|---|---|
| `adminToken: string \| null` | 有值时 🔒 请求（删除、rezip）带 `X-Admin-Token`；其他请求从不带 |
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

`withAdmin(op)`：每次尝试都记下发出时的口令，执行 `op`；遇到 401 `admin-token-required|invalid`：

- 若这期间已经输入了新口令（请求是用旧口令发出的），直接用当前口令重试，**不再弹框**；
- 否则视为发出的口令被拒：立即从内存清除，调用回调询问（发出时带了口令则 `reason: 'admin-token-invalid'`，否则用服务器给的原因）；
- 回调返回的口令与刚被拒的相同 → 不重试，再次询问（`reason: 'admin-token-invalid'`）；返回其他口令 → 存入内存并重试**同一个** `op`。

循环由用户驱动，直到成功或回调返回 `null`/空串（取消）：此时 reject 最后那个 401 `ApiError`，被拒的口令保持清除。对话框打开期间其他调用遇到 401 会等待同一个对话框（不会弹第二个，也不会带上与对话框不符的 reason），得到答案后各自按上述规则重新判断；取消会让所有等待者一起 reject。没注册回调时 401 直接 reject。`library.remove` 与 `library.rezip` 已经包好，组件无需再包。

## 4. Socket

- `useSocket()`（`@/composables/useSocket`）：单例连接，同源 `/socket.io`，引用计数的 `connect/disconnect`，不带 `withCredentials`。
- `bindSocketEvents(socket)`（`@/socket/dispatcher`）：事件 → store 动作：

| 事件 | 动作 |
|---|---|
| `connect`（含首次与重连） | `realtime.markConnected()`、`library.load()`、`queue.load()`；`config.error` 不为空时 `config.load()` |
| `disconnect` | `realtime.markDisconnected(reason)` |
| `connect_error` | `realtime.markConnectError(err)` |
| `queue_updated` | `queue.applySnapshot`（整体替换） |
| `download_started` | `queue.applyStarted` |
| `download_progress` | `queue.applyProgress` |
| `chapter_completed` | `library.applyChapterCompleted` |
| `download_completed` | `library.applyDownloadCompleted` + `queue.applyCompleted` |
| `scan_completed` | `queue.applyScanCompleted` + `library.load()` |
| `dmca_alert` | `library.applyDmcaAlert` |

不处理旧事件名（`downloading_info`、`response`、`complete_info`），也不为它们注册监听。

- `useRealtime()`（`@/composables/useRealtime`）：根组件 setup 里调用一次（已在 `App.vue`）。启动时**不等 socket** 就通过 HTTP 加载 config、library、queue，然后连接 socket。首次 `connect` 也会再加载一次 library/queue：启动快照与连上 socket 之间的事件否则会丢失，而并发加载是安全的（只应用最新的一次），所以为正确性保留这次重复加载。

## 5. 测试辅助

- `@/test/fake-server`：`fakeServer(http)` 替换 axios adapter，真实拦截器与 api 函数照常运行；`reply / replyOnce / replyDeferred / networkError / requests / lastBody`。`replyDeferred()` 返回 `{ received, resolve(status, body), networkError() }`，用于让请求挂起、与 socket 事件交错；挂起的请求遵守 `AbortSignal`。
- `@/test/fixtures`：`makeManga()`、`makeCandidate()`。
