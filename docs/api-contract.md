# VanManga API 契约（规范接口）

- 版本：P2（2026-11-14）
- 规格来源：`docs/superpowers/specs/2026-11-14-migration-completion-roadmap-design.md` 第 6 节
- 适用对象：P3 新前端，以及任何新客户端。本文件足以写出类型化客户端，无需阅读后端源码。
- 旧接口 `/api/dogemanga/*`、旧 socket 事件名、`/js/config.js` 在 P2–P3 期间照旧可用、形状不变，P4 删除；**新客户端不得调用**，本文件不描述它们（见末节"遗留接口"）。

## 1. 通用规则

### 1.1 基础

- 所有接口前缀 `/api`，与页面同源。请求体为 JSON（`Content-Type: application/json`）。
- 所有 `manga_id` 一律是 **string**（可能以 `-` 开头，如 `-LoL2tSY`；放进路径时用 `encodeURIComponent`）。
- 时间：漫画记录里的 `add_date`、`updated_at` 是 **unix 秒**；队列任务里的 `enqueuedAt`、`startedAt`、`finishedAt` 是 **unix 毫秒**。

### 1.2 信封

除二进制图片接口外，每个 `/api` 响应体都是信封：

```ts
/** 成功：HTTP 2xx，code 与 HTTP 状态相同（本契约中成功一律为 200）。 */
interface ApiSuccess<T> {
  code: 200;
  data: T;
}

/** 失败：HTTP 4xx/5xx，code 与 HTTP 状态相同。 */
interface ApiFailure {
  code: number;          // === HTTP 状态
  error: ApiErrorCode;   // 机器可读，客户端据此分支
  message?: string;      // 人类可读的补充说明（英文，仅供日志/调试，不保证稳定）
  data?: unknown;        // 仅个别错误携带，见各接口说明（如 duplicate）
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
```

规则：

- HTTP 状态如实反映成败；`code` 恒等于 HTTP 状态。客户端可只看 HTTP 状态，也可只看 `code`。
- 任何未被处理的异常（含未知路由、请求体校验失败、内部错误）都由全局异常过滤器输出 `ApiFailure`，不会出现别的结构。
- 二进制接口（封面图）成功时返回 `image/jpeg`，失败时仍返回 `ApiFailure` JSON。

### 1.3 错误码一览

```ts
type ApiErrorCode =
  // 400
  | 'validation-failed'   // 请求体/查询参数不符合要求；message 列出原因
  | 'query-required'      // 搜索词为空
  | 'bad-request'         // 其他 400
  // 401 —— 只用于管理员口令，客户端可据此弹口令框
  | 'admin-token-required' // 服务端启用了 ADMIN_TOKEN，请求没带 X-Admin-Token
  | 'admin-token-invalid'  // 带了，但不匹配
  // 403
  | 'kavita-login-failed'   // Kavita 拒绝了用户名/密码
  | 'kavita-refresh-failed' // Kavita 拒绝了刷新令牌
  // 404
  | 'not-found'           // 未知路由
  | 'manga-not-found'     // 库里没有该 manga_id
  | 'unknown-source'      // 未注册的抓取源
  | 'thumbnail-not-found' // 封面文件不存在 / 搜索缓存已过期
  | 'kavita-disabled'     // 服务端未配置 Kavita
  // 409
  | 'manga-busy'          // 该漫画正在下载或在队列中，不能删除
  | 'already-in-library'  // 添加的漫画已在库中
  | 'duplicate'           // 疑似重复，需二次确认；data 携带候选名
  // 410
  | 'search-expired'      // 添加时搜索缓存已过期，需重新搜索
  // 429
  | 'rate-limited'        // 源站限流
  // 451
  | 'dmca'                // 源站因 DMCA 下架
  // 500
  | 'delete-failed'       // 删除下载目录失败，记录未删除
  | 'internal-error'
  // 502
  | 'scraper-failed'      // 抓取进程失败/超时/输出无法解析
  | 'scraper-blocked'     // 源站 Cloudflare 拦截
  | 'kavita-unreachable'; // 连不上 Kavita 或 Kavita 返回异常
```

客户端遇到表中没有的 `error` 字符串时，应按 HTTP 状态做通用处理（形如 `http-<status>` 的值可能出现在少见状态上）。

### 1.4 管理员口令

- 服务端环境变量 `ADMIN_TOKEN`。未设置（或为空）时不启用保护，下文标注 🔒 的接口无需口令。
- 启用后，🔒 接口必须带请求头 `X-Admin-Token: <口令>`：
  - 未带 → `401 admin-token-required`
  - 不匹配 → `401 admin-token-invalid`
- 服务端用定长时间比较。是否启用可从 `GET /api/config` 的 `adminRequired` 得知。
- 🔒 接口：`DELETE /api/library/:mangaId`、`POST /api/library/rezip`。
- 401 **只**用于管理员口令；其他接口不会返回 401（Kavita 登录失败用 403）。

## 2. 数据类型

```ts
/** 库中的一部漫画（库接口返回的规范形态）。 */
interface Manga {
  manga_id: string;
  manga_name: string;
  artist_name: string;
  /** 源站的最新话名（添加时从搜索结果得到）。 */
  newest_epi: string;
  /** 恒为相对路径 `/api/library/<encodeURIComponent(manga_id)>/thumbnail`。
   *  旧记录里的绝对地址、`/api/dogemanga/thumbnail?mid=` 均在读取时归一。 */
  thumbnail: string;
  /** 已下载的最大章节序号（1 起）。新添加、尚未下载时为 1。 */
  last_epi: number;
  /** 已下载的最大章节的名字（改写后的章节名，同压缩包名）。未下载时为 ''。 */
  last_epi_name: string;
  /** 首次全量下载是否完成。 */
  completed: boolean;
  /** 0 = 连载中，1 = 已完结（源站状态）。 */
  serialization: 0 | 1;
  /** 0 = 自动更新开启，1 = 暂停。 */
  download_switch: 0 | 1;
  /** 加入库的时间，unix 秒（可能带小数）。写入后永不修改。 */
  add_date: number;
  /** 最近更新时间，unix 秒。最新话推进或一次下载完成时写入；
   *  旧记录没有该字段时取 add_date。主页按它排序。 */
  updated_at: number;
  /** 抓取源名，旧记录缺省为 'dgmanga'。 */
  source: string;
  /** Kavita 系列页地址；未关联时为 null。 */
  kavita_url: string | null;
  /** 源站最近更新日期（部分源在搜索时提供）。 */
  recent_update_date?: string;
}

/** 搜索结果中的一个候选。 */
interface SearchCandidate {
  manga_id: string;
  manga_name: string;
  artist_name: string;
  newest_epi: string;
  /** 恒为封面图 URL：`/api/scraper/<source>/search-thumbnail/<manga_id>`，
   *  只在搜索缓存有效期内（默认 30 分钟）可取。 */
  thumbnail: string;
  source: string;
  recent_update_date?: string;
}

/** 源站的一个章节。 */
interface Chapter {
  /** 章节序号，1 起，按源站顺序。 */
  index: number;
  /** 源站原始标题。 */
  title: string;
  /** 章节页地址；重下时原样回传。 */
  url: string;
}

type TaskKind = 'full-manga' | 'redownload' | 'rezip';

/** 队列中的一个任务。 */
interface TaskSummary {
  id: string;
  kind: TaskKind;
  /** rezip 任务没有此字段。 */
  mangaId?: string;
  /** 列表里只会出现 pending（排队）和 running（运行中）。 */
  status: 'pending' | 'running';
  enqueuedAt: number;   // unix 毫秒
  startedAt?: number;   // unix 毫秒，running 时有
}

/** 队列快照：当前任务 + 排队列表（按执行顺序）。 */
interface QueueSnapshot {
  active: TaskSummary | null;
  pending: TaskSummary[];
}
```

## 3. 接口

### 3.1 运行时配置

#### `GET /api/config`

```ts
type Data = {
  kavitaEnabled: boolean;
  /** 浏览器访问 Kavita 的地址；kavitaEnabled 为 false 时为 null。 */
  kavitaExposeUrl: string | null;
  /** 服务端是否设置了 ADMIN_TOKEN。 */
  adminRequired: boolean;
};
```

无失败分支。

### 3.2 搜索（抓取源）

#### `GET /api/scraper/sources`

`data: { name: string; displayName: string }[]`（当前只有 `{ name: 'dgmanga', displayName: 'DogeManga' }`）。

#### `GET /api/scraper/:source/search?q=<关键词>`

- 成功：`data: SearchCandidate[]`。**没有结果时为 `[]`（HTTP 200）**，不是错误。
- 搜索结果写入服务端缓存（默认 30 分钟），之后才能用 `POST /api/library` 添加。

| HTTP | error | 条件 |
|---|---|---|
| 400 | `query-required` | `q` 缺失或只有空白 |
| 404 | `unknown-source` | `:source` 未注册 |
| 502 | `scraper-failed` | 抓取进程失败、超时 |

#### `GET /api/scraper/:source/search-thumbnail/:mangaId`

- 成功：`image/jpeg` 二进制。
- 失败：`404 thumbnail-not-found`（缓存中没有该候选或已过期）。

#### 调试用抓取接口（新前端不需要）

以下接口直接透传抓取结果，成功时 `data` 为抓取结果：

- `GET /api/scraper/:source/manga/:mangaId/metadata` → `data: { chapterCount: number; serialization: 0 | 1 }`
- `GET /api/scraper/:source/manga/:mangaId/chapters` → `data: Chapter[]`
- `GET /api/scraper/:source/chapter-images?url=<章节页>` → `data: { chapterTitle: string; imageUrls: string[]; requestHeaders?: Record<string, string> }`

共同失败：`404 unknown-source`、`502 scraper-failed`、`502 scraper-blocked`、`429 rate-limited`（仅 chapter-images）、`451 dmca`。

### 3.3 漫画库

#### `GET /api/library`

`data: Manga[]`（顺序为加入顺序；排序由客户端按 `updated_at` 做）。

#### `POST /api/library` — 添加漫画

请求体（精简形态，**只**看这三个字段，其余字段一律忽略）：

```ts
type Body = {
  manga_id: string;
  source: string;            // 搜索时的源名，如 'dgmanga'
  /** '0' 或省略：首次提交，服务端查重；
   *  '1'：用户已确认重复仍要添加，跳过查重；
   *  '2'：用户取消，服务端什么都不做。 */
  submit_sign?: '0' | '1' | '2';
};
```

服务端从搜索缓存补全名称、作者、封面等字段。

成功（HTTP 200）：

```ts
type Data =
  | { status: 'added'; manga: Manga }   // 已加入库，并已自动排入全量下载
  | { status: 'cancelled' };            // submit_sign === '2'
```

| HTTP | error | 条件 | 附带 data |
|---|---|---|---|
| 400 | `validation-failed` | 缺 `manga_id`/`source`，或 `submit_sign` 非法 | — |
| 409 | `already-in-library` | 该 `manga_id` 已在库中 | `{ manga: Manga }` |
| 409 | `duplicate` | 未带 `submit_sign: '1'` 且库中有名字相近的漫画 | `{ duplicates: string[] }`（相近漫画的名字） |
| 410 | `search-expired` | 搜索缓存中已无该候选（过期、重启或未搜索过） | — |

二次确认流程：收到 `duplicate` → 让用户确认 → 用 `submit_sign: '1'` 重发；用户放弃则可发 `submit_sign: '2'` 或什么都不发。收到 `search-expired` → 重新搜索后重发。

#### `GET /api/library/:mangaId/thumbnail`

- 成功：`image/jpeg` 二进制。
- 失败：`404 thumbnail-not-found`。

#### `GET /api/library/:mangaId/chapters` — 源站章节列表（重下选择用）

读取**路径参数** `mangaId`，按该漫画的 `source` 实时抓取。

- 成功：`data: Chapter[]`
- 失败：`404 manga-not-found`、`502 scraper-failed`、`502 scraper-blocked`、`451 dmca`

#### `POST /api/library/:mangaId/auto-update` — 切换自动更新

无请求体。成功：`data: { currentDownloadStatus: 0 | 1 }`（切换后的 `download_switch`）。失败：`404 manga-not-found`。

#### `DELETE /api/library/:mangaId` 🔒 — 删除漫画及其下载目录

- 成功：`data: true`
- 失败：

| HTTP | error | 条件 |
|---|---|---|
| 401 | `admin-token-required` / `admin-token-invalid` | 见 1.4 |
| 404 | `manga-not-found` | 库中无此漫画 |
| 409 | `manga-busy` | 正在下载或在队列中 |
| 500 | `delete-failed` | 删除下载目录失败，记录保留 |

#### `POST /api/library/rezip` 🔒 — 全盘重新打包

无请求体。排入一个 rezip 任务；队列里已有 rezip（排队或运行中）时返回那个任务。

- 成功：`data: { taskId: string }`
- 失败：`401 admin-token-required` / `admin-token-invalid`

完成时广播 `scan_completed`。

#### 库内检索（P4 可能删除，新前端不需要）

- `GET /api/library/short` → `data: { manga_id: string; manga_name: string }[]`
- `GET /api/library/search?query=<词>` → `data: Manga[]`（名字、作者或 id 包含该词；空词返回 `[]`）
- `GET /api/library/paginate?start=<n>&limit=<n>`（均为 ≥1 的整数，默认 1、10）→
  `data: { start: number; limit: number; count: number; previous: {start:number;limit:number} | ''; next: {start:number;limit:number} | ''; lib_paginate: Manga[] }`；参数非法 → `400 validation-failed`

### 3.4 下载队列

队列单并发、先进先出，状态持久化到磁盘，重启后恢复（运行中被打断的任务回到队首）。

去重规则：

- `full-manga`：同一漫画已有排队或运行中的 full-manga 任务时，不新建，返回已有任务。
- `redownload`：同一漫画已有**排队中**的 redownload 任务时，把新章节并入那个任务（按 `url` 去重），返回那个任务。
- `rezip`：已有排队或运行中的 rezip 时返回已有任务。

#### `POST /api/download` — 排入全量下载

```ts
type Body = { manga_id: string };
type Data = { taskId: string };
```

从 `last_epi + 1` 开始下载源站上的新章节（从未下载过的从第 1 话开始）。失败：`400 validation-failed`、`404 manga-not-found`。

#### `POST /api/download/chapters` — 重下指定章节

```ts
type Body = {
  manga_id: string;
  chapters: Chapter[];   // 至少 1 个；通常取自 GET /api/library/:mangaId/chapters
};
type Data = { taskId: string };
```

重下不改变 `last_epi`。失败：`400 validation-failed`、`404 manga-not-found`。

#### `GET /api/download/queue`

`data: QueueSnapshot`

#### `GET /api/download/current`

`data: TaskSummary | null`（当前运行中的任务）

### 3.5 Kavita

#### `POST /api/kavita/login`

```ts
type Body = { username: string; password: string };
type Data = {
  apiKey: string;
  jwt: string;
  refreshToken: string;
  /** 浏览器打开即可登录 Kavita 的完整地址（自动登录用这个，不要自己拼）。 */
  loginUrl: string;
};
```

| HTTP | error | 条件 |
|---|---|---|
| 400 | `validation-failed` | 缺字段 |
| 403 | `kavita-login-failed` | Kavita 拒绝该用户名/密码 |
| 404 | `kavita-disabled` | 服务端未配置 Kavita |
| 502 | `kavita-unreachable` | 连不上 Kavita 或其他上游错误 |

#### `POST /api/kavita/refreshtoken`

```ts
type Body = { jwt: string; refreshToken: string };
type Data = { jwt: string; refreshToken: string };
```

失败：`400 validation-failed`、`403 kavita-refresh-failed`、`404 kavita-disabled`、`502 kavita-unreachable`。

#### `GET /api/kavita/status`（遗留，新前端改用 `GET /api/config`）

现有前端启动时调用，P2 期间保持旧形状：HTTP 200，`{ code: 200, data: true }` 或 `{ code: 404, data: false }`。**不遵守本契约的信封规则**，P4 删除。

## 4. Socket.IO 事件

- 连接：同源 Socket.IO（默认路径 `/socket.io`），传输 `websocket` 或 `polling`。无需认证，无需加入房间；所有事件广播给全部连接。
- 客户端只监听，不发送任何事件。
- 下表事件名与载荷为规范；同一时刻服务端还会发旧事件名（`downloading_info`、`response`、`complete_info`），新客户端忽略它们即可。

```ts
interface ServerToClientEvents {
  download_started: (p: DownloadStartedEvent) => void;
  download_progress: (p: DownloadProgressEvent) => void;
  chapter_completed: (p: ChapterCompletedEvent) => void;
  download_completed: (p: DownloadCompletedEvent) => void;
  queue_updated: (p: QueueSnapshot) => void;
  scan_completed: () => void;
  dmca_alert: (p: DmcaAlertEvent) => void;
}

/** 一个 full-manga 或 redownload 任务开始实际下载（源站检查通过后）。
 *  full-manga 在源站没有新章节时可能不发此事件，直接结束。 */
interface DownloadStartedEvent {
  manga_id: string;
  kind: 'full-manga' | 'redownload';
}

/** 章节级进度。确定本次要下的章节后先发一次（chapters_done = 0），
 *  之后每个章节结束（成功或失败）各发一次。 */
interface DownloadProgressEvent {
  manga_id: string;
  chapters_total: number;
  /** 已结束的章节数（含失败）。 */
  chapters_done: number;
  /** 其中失败的章节数。 */
  chapters_failed: number;
}

/** 一个章节下载并打包成功。last_epi / last_epi_name / updated_at 为该记录此刻的值
 *  （full-manga 推进最新话时随之变化；redownload 不改变 last_epi）。 */
interface ChapterCompletedEvent {
  manga_id: string;
  chapter_index: number;
  /** 改写后的章节名（同压缩包名）。 */
  chapter_title: string;
  last_epi: number;
  last_epi_name: string;
  updated_at: number;   // unix 秒
}

/** 一个已发过 download_started 的任务结束。
 *  status 'done'：至少一个章节成功或没有要下的章节；'failed'：全部章节失败、
 *  源站拦截或任务出错。manga 为结束时的完整记录（规范形态），
 *  漫画已被删除（如 DMCA）时为 null。客户端可直接用它替换库里那条记录。 */
interface DownloadCompletedEvent {
  manga_id: string;
  kind: 'full-manga' | 'redownload';
  status: 'done' | 'failed';
  chapters_total: number;
  chapters_failed: number;
  manga: Manga | null;
}

/** 队列变化：任务入队、开始、结束（含失败）时各发一次，载荷为变化后的完整快照。 */
// queue_updated: QueueSnapshot（见第 2 节）

/** scan_completed：rezip 任务结束，无载荷。 */

/** 源站报告该漫画因 DMCA 下架；服务端已把它从库中删除（含下载目录）。 */
interface DmcaAlertEvent {
  manga_id: string;
  manga_name: string;
}
```

典型顺序（添加一部漫画）：`queue_updated`（入队）→ `queue_updated`（开始）→ `download_started` → `download_progress`(0/N) → [`chapter_completed` → `download_progress`] × N → `download_completed` → `queue_updated`（结束）。

## 5. 遗留接口（P4 删除，新客户端勿用）

- HTTP：`/api/dogemanga/*` 全部路由，响应形状保持 P1 时的样子（多数 HTTP 200/201 + `{ code, data }`，删除冲突为 HTTP 409 + `{ statusCode, timestamp, path, message: { data: false, code: 434 } }`）。启用 `ADMIN_TOKEN` 后，旧的删除（`DELETE /api/dogemanga/deletemanga`）和重新打包（`GET /api/dogemanga/rezip`）同样要求 `X-Admin-Token`，否则规范接口的保护可被旧路由绕过。
- `GET /api/kavita/status`（见 3.5）。
- `GET /js/config.js`：`window.MANGA_BASE_URL`、`window.MANGA_BASE_WEBSOCKET_URL`，由 `GET /api/config` 取代。
- Socket：`downloading_info`（载荷为裸 `manga_id` 字符串）、`response`（`{ manga_id, last_epi_name, last_epi }`）、`complete_info`（`{ manga_id }`）。
