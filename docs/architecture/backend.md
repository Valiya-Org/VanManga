# VanManga 后端与 Python 抓取器：方法级参考

对应分支：`feature/nestjs-migration-stage-0-1`。

本文是 [`../architecture.md`](../architecture.md) 的细化版，只覆盖后端（`backend/`）、Python 抓取器（`scrape_cli.py`、`modules/`、`utils/`）、根目录 `Dockerfile` 和 `.github/workflows/ci.yml`。前端见 [`../frontend-data-layer.md`](../frontend-data-layer.md)，接口契约见 [`../api-contract.md`](../api-contract.md)。

## 阅读约定

- 每个文件一节：先说文件负责什么，再逐个列出导出符号、类方法（公有和私有）、构造函数依赖、常量和带行为的装饰器。
- 每个符号下最多三项：
  - **作用**：输入、返回值、抛出的错误或错误码、副作用（写文件、发事件、Socket 广播）。
  - **调用方**：用 `grep` 在 `backend/src`（不含 `*.spec.ts`）中找到的 `文件 → 方法`。由框架调用的写"由 Nest 在启动时调用""HTTP 路由""事件 `x` 触发""定时触发"。没有调用方时写"生产代码无调用方"。
  - **实现说明**：只在实现不简单时写，讲算法、顺序与并发保证、处理的边界情况，以及代码注释里写明的理由。
- "单测"一行说明同目录是否有 `*.spec.ts`。单测本身不展开。
- 拿不准的地方标"未确认"。
- 路径相对于 `backend/src/`，另有说明的除外。

## 目录

- [0. 总览](#0-总览)
- [1. 启动与全局装配](#1-启动与全局装配)
- [2. 配置 `config/`](#2-配置-config)
- [3. 公共设施 `common/`](#3-公共设施-common)
- [4. 漫画库 `modules/library/`](#4-漫画库-moduleslibrary)
- [5. 抓取 `modules/scraper/` 与搜索缓存 `modules/search-cache/`](#5-抓取-modulesscraper-与搜索缓存-modulessearch-cache)
- [6. 下载 `modules/download/`](#6-下载-modulesdownload)
- [7. 文件系统 `modules/filesystem/`](#7-文件系统-modulesfilesystem)
- [8. 实时推送 `modules/events/`](#8-实时推送-modulesevents)
- [9. 定时任务 `modules/scheduler/`](#9-定时任务-modulesscheduler)
- [10. Kavita `modules/kavita/`](#10-kavita-moduleskavita)
- [11. Cloudflare `modules/cloudflare/`](#11-cloudflare-modulescloudflare)
- [12. 前端托管 `modules/frontend/`](#12-前端托管-modulesfrontend)
- [13. 后端 e2e 测试 `backend/test/`](#13-后端-e2e-测试-backendtest)
- [14. Python 抓取器](#14-python-抓取器)
- [15. 根目录 `Dockerfile`](#15-根目录-dockerfile)
- [16. `.github/workflows/ci.yml`](#16-githubworkflowsciyml)
- [17. 读代码时发现的值得注意的行为](#17-读代码时发现的值得注意的行为)

---

## 0. 总览

### 0.1 模块依赖

来自各 `*.module.ts`。"全局"指模块带 `@Global()`，它导出的提供者不用 `imports` 就能在任何模块里注入。

| 模块 | 全局 | imports | providers | controllers | exports |
|---|---|---|---|---|---|
| `AppModule`（`app.module.ts`） | 否 | `ConfigModule`、`EventEmitterModule.forRoot()`、`SearchCacheModule`、`FilesystemModule`、`CloudflareModule`、`EventsModule`、`ScraperModule`、`LibraryModule`、`DownloadModule`、`KavitaModule`、`SchedulerModule`、`FrontendModule` | — | — | — |
| `ConfigModule`（`config/config.module.ts`） | 是 | `NestConfigModule.forRoot({ isGlobal: true, load: [configuration], cache: true, envFilePath: ['.env.local', '.env'] })` | — | — | —（`ConfigService` 因 `isGlobal: true` 全局可用） |
| `SearchCacheModule` | 是 | — | `SearchCacheService` | — | `SearchCacheService` |
| `FilesystemModule` | 是 | — | `FilesystemService`、`ArchiveService`、`ThumbnailService` | — | 同 providers |
| `CloudflareModule` | 是 | `HttpModule.register({ timeout: 70_000, maxRedirects: 5 })` | `CloudflareService` | — | `CloudflareService`、`HttpModule` |
| `EventsModule` | 是 | — | `EventsGateway` | — | `EventsGateway` |
| `ScraperModule` | 否 | — | `PythonRunnerService`、`SourceRegistryService`、`ScraperService`、`DGmangaSource`、`{ provide: MANGA_SOURCE_TOKEN, useFactory: (...impls) => impls, inject: [DGmangaSource] }` | `ScraperController` | `ScraperService`、`SourceRegistryService` |
| `LibraryModule` | 否 | — | `LibraryRepository`、`LibraryService`、`MangaFactoryService`、`DuplicateCheckService` | `LibraryController` | `LibraryService`、`LibraryRepository` |
| `DownloadModule` | 是 | `HttpModule.register({ timeout: 30_000, maxRedirects: 5 })`、`LibraryModule`、`ScraperModule` | `TaskQueueService`、`ImageDownloaderService`、`DownloadOrchestratorService`、`DownloadService` | `DownloadController` | `DownloadService`、`TaskQueueService` |
| `KavitaModule` | 否 | `HttpModule.register({ timeout: 15_000, maxRedirects: 3 })`、`LibraryModule` | `KavitaService` | `KavitaController` | `KavitaService` |
| `SchedulerModule` | 否 | `ScheduleModule.forRoot()`、`LibraryModule`、`ScraperModule`、`DownloadModule`、`KavitaModule` | `SchedulerService` | — | — |
| `FrontendModule` | 否 | `ConfigModule`（来自 `@nestjs/config`） | — | `FrontendController` | —（静态文件不经模块，由 `configureApp` 注册的 Express 中间件提供，见第 12 节） |

依赖要点：

- `LibraryController` 注入 `TaskQueueService`，但 `LibraryModule` 没有导入 `DownloadModule`。能注入是因为 `DownloadModule` 是全局模块并导出了 `TaskQueueService`。这样避免了 `LibraryModule` ↔ `DownloadModule` 的循环导入（`DownloadModule` 导入了 `LibraryModule`）。
- 三个 `HttpModule.register` 是三个独立的 `HttpService` 实例，超时不同：`ImageDownloaderService` 拿到 `DownloadModule` 的（30 秒），`CloudflareService` 拿到 `CloudflareModule` 的（70 秒），`KavitaService` 拿到 `KavitaModule` 的（15 秒）。`SchedulerService.cfProbe` 不用 `HttpService`，直接动态导入 `axios`，超时 15 秒。
- 跨模块的直接调用只走导出的服务；"库 → 下载""下载 → Kavita""队列 → 网关"三条方向用进程内事件（见 0.2），注释（`common/events/app.events.ts`）写明是为了消除 `DownloadModule`、`KavitaModule`、`LibraryModule` 之间的循环依赖。

### 0.2 进程内事件（`@nestjs/event-emitter`）

| 事件名（常量） | 载荷 | 发出方 | 监听方 |
|---|---|---|---|
| `manga.added`（`MANGA_ADDED`） | `MangaAddedEvent { mangaId }` | `library/library.controller.ts → LibraryController.add`（`addManga` 结果为 `added` 时） | `download/download.service.ts → DownloadService.handleMangaAdded`（排入 full-manga 任务） |
| `download.completed`（`DOWNLOAD_COMPLETED`） | `DownloadCompletedEvent { mangaId, mangaName }` | `download/download-orchestrator.service.ts → runFullManga`（成功结束时）、`→ runRedownload`（只要没抛错就发，含全部章节失败） | `kavita/kavita.service.ts → KavitaService.handleDownloadCompleted`（触发 Kavita 扫描该目录） |
| `queue.changed`（`QUEUE_CHANGED`） | `QueueSnapshot` | `download/queue/task-queue.service.ts → TaskQueueService.changed`（入队、重下合并、任务开始、任务结束） | `events/events.gateway.ts → EventsGateway.handleQueueChanged`（转发为 Socket `queue_updated`） |

行为说明（读 `node_modules/@nestjs/event-emitter/dist/event-subscribers.loader.js` 确认）：`EventEmitter2.emit` 同步调用监听器；`@OnEvent` 监听器被包在 `wrapFunctionInTryCatchBlocks` 里，默认 `suppressErrors` 为 `true`，监听器抛错只写日志，不会传回 `emit` 的调用方。所以 `LibraryController.add` 在 `emit` 返回时，`DownloadService.handleMangaAdded` 已经同步执行完 `enqueue`；即使入队失败，`POST /api/library` 也照样返回 200。

### 0.3 Socket 事件

全部由 `events/events.gateway.ts` 的 `EventsGateway` 广播给所有连接（`this.server?.emit`），客户端不发消息。

| 事件 | 网关方法 | 谁调用、何时 |
|---|---|---|
| `download_started` | `emitDownloadStarted` | `DownloadOrchestratorService.announceStart` ← `runFullManga`（元数据检查通过、且不是"已是最新"之后，取章节列表之前）；← `runRedownload`（任务一开始） |
| `download_progress` | `emitDownloadProgress` | `DownloadOrchestratorService.processChapters` 里的 `progress()`：进入章节循环前发一次（`chapters_done: 0`），之后每个章节结束（成功或失败）各发一次 |
| `chapter_completed` | `emitChapterCompleted` | `DownloadOrchestratorService.processOneChapter` 末尾：一个章节下载并打包成功、`last_epi` 处理完之后 |
| `download_completed` | `emitDownloadCompleted` | `DownloadOrchestratorService.announceEnd` ← `runFullManga`（章节列表被拦截、出错、全部章节失败、正常结束四条路径）；← `runRedownload`（出错、正常结束两条路径） |
| `queue_updated` | `handleQueueChanged`（`@OnEvent(QUEUE_CHANGED)`） | 进程内事件 `queue.changed` 触发，见 0.2 |
| `scan_completed` | `emitScanCompleted` | `DownloadOrchestratorService.runRezip` 结束时（无载荷） |
| `dmca_alert` | `emitDmcaAlert` | `DownloadOrchestratorService.handleDmca`（元数据或章节列表返回 `errorCode` 504 时） |

### 0.4 路由表

全局前缀 `/api`（`app.setup.ts`）。"守卫"列为空表示无守卫。所有 `POST` 都用 `@HttpCode(200)`。

| 方法 + 路径 | 控制器方法 | 调用的服务方法 | 守卫 |
|---|---|---|---|
| `GET /api/config` | `FrontendController.getConfig` | 无（构造时算好的 `runtime`） | |
| `GET /api/library` | `LibraryController.list` | `LibraryService.list` → `LibraryRepository.list`；`toApiManga` | |
| `POST /api/library` | `LibraryController.add` | `LibraryService.addManga`；成功时 `EventEmitter2.emit(MANGA_ADDED)` | |
| `POST /api/library/:mangaId/auto-update` | `LibraryController.toggle` | `LibraryService.toggleAutoUpdate` | |
| `DELETE /api/library/:mangaId` | `LibraryController.delete` | `TaskQueueService.isMangaBusy`、`LibraryService.deleteManga` | `AdminTokenGuard` |
| `GET /api/library/:mangaId/thumbnail` | `LibraryController.thumbnail` | `LibraryService.has`、`sendThumbnail` → `ThumbnailService.getThumbnailPath` | |
| `GET /api/library/:mangaId/chapters` | `DownloadController.chapters` | `LibraryService.get`、`ScraperService.getChapters`（经 `callScraper`、`assertScrapeOk`） | |
| `POST /api/library/rezip` | `DownloadController.rezip` | `DownloadService.submitRezip` → `TaskQueueService.enqueue` | `AdminTokenGuard` |
| `POST /api/download` | `DownloadController.submit` | `DownloadService.submitFullManga` → `TaskQueueService.enqueue` | |
| `POST /api/download/chapters` | `DownloadController.redownload` | `DownloadService.submitRedownload` → `TaskQueueService.enqueue` | |
| `GET /api/download/queue` | `DownloadController.queue` | `DownloadService.snapshot` → `TaskQueueService.snapshot` | |
| `GET /api/download/current` | `DownloadController.current` | `DownloadService.current` → `TaskQueueService.activeSummary` | |
| `GET /api/scraper/sources` | `ScraperController.listSources` | `ScraperService.listSources` → `SourceRegistryService.describe` | |
| `GET /api/scraper/:source/search?q=` | `ScraperController.search` | `ScraperService.search`（经 `toScraperFailure`） | |
| `GET /api/scraper/:source/search-thumbnail/:mangaId` | `ScraperController.searchThumbnail` | `SearchCacheService.get` | |
| `GET /api/scraper/:source/manga/:mangaId/metadata` | `ScraperController.metadata` | `ScraperService.getMetadata`（经 `callScraper`、`assertScrapeOk`） | |
| `GET /api/scraper/:source/manga/:mangaId/chapters` | `ScraperController.chapters` | `ScraperService.getChapters`（同上） | |
| `GET /api/scraper/:source/chapter-images?url=` | `ScraperController.chapterImages` | `ScraperService.getChapterImages`（同上） | |
| `POST /api/kavita/login` | `KavitaController.login` | `KavitaService.login` | |
| `POST /api/kavita/refreshtoken` | `KavitaController.refreshToken` | `KavitaService.refreshToken` | |
| `GET /api/docs` | Swagger UI | `bootstrap.ts → createApp` 里 `SwaggerModule.setup('api/docs', …)` | |

不在 Nest 路由里的请求：`/socket.io`（Socket.IO）、不带扩展名的其他 GET/HEAD（`spaFallback` 返回 `index.html`）、`frontend/dist` 里存在的文件（`app.useStaticAssets`）。其余（包括不存在的 `/assets/*.js`、`/js/config.js`）落到 Nest 的 404，输出 `not-found` 信封。

### 0.5 启动顺序与生命周期钩子

| 钩子 | 所在 | 做什么 |
|---|---|---|
| `bootstrap()` | `main.ts` | 信任库检查 → `createApp()`（建应用 → `configureApp` → Swagger）→ `listen` |
| `onModuleInit` | `TaskQueueService` | 同步读 `queue.json` 恢复队列（只放进 `pending`，还没有执行器，不会开始执行） |
| `onModuleInit`（async） | `LibraryRepository` | 读入或新建 `manga_library.json`；失败则抛错，进程退出 |
| `onModuleInit` | `SourceRegistryService` | 登记抓取源，重名则抛错 |
| `onModuleInit`（async） | `SchedulerService` | 后台 Kavita 同步；`setImmediate` 后台启动扫描（入队的任务排在恢复的任务后面） |
| `onApplicationBootstrap` | `DownloadOrchestratorService` | `queue.registerExecutor(...)`，然后队列开始执行 |
| `afterInit` | `EventsGateway` | 写一行日志 |
| `@Cron('0 30 1 * * *', { name: 'daily-scan' })` | `SchedulerService.handleDailyScan` | 每天 01:30:00 扫描 |
| `@Interval('kavita-sync', 6 * 60 * 60 * 1000)` | `SchedulerService.handleKavitaSync` | 每 6 小时 Kavita 同步 |
| 动态 `setInterval`（键 `cf-monitor`，720 000 ms） | `SchedulerService.ensureCfMonitor` | 检测到 Cloudflare 验证后每 12 分钟复查 |

Nest 逐个模块调用 `onModuleInit` 并等待返回的 Promise，顺序按模块的"距离"从大到小：被导入的模块先于导入它的模块，但**全局模块的距离固定为最大值，最先初始化**（`@nestjs/core` 的 `scanner.js`、`nest-application-context.js`）。`DownloadModule` 是全局模块，所以它的 `onModuleInit` 早于 `LibraryModule`，虽然它导入了 `LibraryModule`。所有模块的 `onModuleInit` 都结束后，Nest 才调用 `onApplicationBootstrap`。

因此执行器在 `onApplicationBootstrap` 里注册：这时 `LibraryRepository` 一定已经读完库文件，队列里的任务（包括从 `queue.json` 恢复的）不可能在库加载前开始。恢复仍放在 `onModuleInit`，先于任何入队（启动扫描、请求），所以恢复的任务排在启动期间入队的任务前面，并参与去重。`drain()` 要求 `active` 为空且已有执行器，缺一个就直接返回；注册执行器时再调用一次 `drain()`。

（修复前执行器在 `DownloadOrchestratorService.onModuleInit` 注册，恢复的任务在库加载前就开始，全部以 `Unknown manga` 失败并被丢弃，重下任务永久丢失。由 `test/queue-restore.e2e-spec.ts` 防回归。）

---

## 1. 启动与全局装配

### `main.ts`

进程入口。单测：无（除信任库检查和 `listen` 外，启动流程就是 `createApp`，由 e2e 覆盖）。

#### `bootstrap(): Promise<void>`（文件内函数，未导出）

- **作用**：
  1. 调用 `findRevokedRoots()`；若 Node 内置信任库里仍有被吊销的根证书，抛出 `Error`，信息为 `Node ${process.version} trusts revoked root(s): … Upgrade to Node 22.23.4 / 24.22.1 / 26.12.1 or later.`。
  2. `createApp({ logger: ['log','error','warn','debug','verbose'] })`（见 `bootstrap.ts`）。
  3. 读配置 `port`（默认 5000），`app.listen(port)`（`listen` 内部调用 `app.init()`），打两行日志。
- **调用方**：文件末尾 `bootstrap().catch(...)`：任何错误写 `Fatal bootstrap error` 日志后 `process.exit(1)`。
- **实现说明**：
  - 信任库检查的理由（注释）：抓取与 Kavita 的出站请求依赖 Node 自带的 CA 列表，浏览器的吊销机制（CRLSet/OneCRL）管不到它，所以发现被吊销的根证书时拒绝启动。
  - `LibraryRepository.onModuleInit` 抛出的错误（库文件损坏）在 `app.listen` → `init` 期间冒出，走同一个 `catch`，进程退出。

### `bootstrap.ts`

生产环境装配应用的唯一入口。`main.ts`、四个后端 e2e 文件、`frontend/e2e/start-backend.cjs`（非 `E2E_BACKEND_MAIN` 模式）都用它，所以测试与生产装配出的是同一个应用。单测：无（e2e 覆盖）。

#### `createApp(options?: Omit<NestApplicationOptions, 'bodyParser'>): Promise<NestExpressApplication>`

- **作用**：
  1. `NestFactory.create<NestExpressApplication>(AppModule, { ...options, bodyParser: false })`。
  2. `configureApp(app)`。
  3. `SwaggerModule.setup('api/docs', app, buildSwaggerDocument(app))`。
  4. 返回 `app`，不调用 `init`/`listen`。
- **调用方**：`main.ts → bootstrap`（传日志级别）；`test/*.e2e-spec.ts` 的 `beforeAll`（`{ logger: ['error'], abortOnError: false }`，随后 `await app.init()`）；`frontend/e2e/start-backend.cjs`（随后 `listen`）。
- **实现说明**：
  - `bodyParser: false` 是必须的：`configureApp` 自己注册上限 1 MB 的解析器，替换 Express 默认 100 kb 的那个。
  - 不用 `Test.createTestingModule(...).compile()` + `createNestApplication` 的理由：那种方式在 HTTP 适配器存在之前就实例化所有提供者，行为与生产不同。实例：以前的 `@nestjs/serve-static` 在测试里退化成空操作的 `NoopLoader`，它在生产里造成的两个问题（见第 12 节）e2e 都没发现。

### `app.module.ts`

根模块，只做装配，见 0.1。单测：无。

#### `AppModule`

- **作用**：按顺序导入所有模块；`EventEmitterModule.forRoot()` 在这里注册（默认选项）。
- **调用方**：`bootstrap.ts → createApp`。

### `app.setup.ts`

把生产环境的 HTTP 管线集中在一个函数里，由 `createApp` 调用。单测：无（e2e 覆盖）。

#### `BODY_LIMIT = '1mb'`

- **作用**：JSON 与 urlencoded 请求体上限。
- **调用方**：`configureApp`。
- **实现说明**：注释的理由：最大的请求体是重下的章节列表，每章约 150 字节，长连载可能超过 100 kb。超限时 body-parser 抛 413，由 `AllExceptionsFilter` 输出 `{ code: 413, error: 'payload-too-large' }`。

#### `configureApp(app: NestExpressApplication): void`

- **作用**：依次：
  1. `app.useBodyParser('json', { limit: BODY_LIMIT })`、`app.useBodyParser('urlencoded', { extended: true, limit: BODY_LIMIT })`。
  2. 读 `security.corsOrigins`（`app.get(ConfigService, { strict: false })`）。非空时 `app.enableCors({ origin: corsOrigins, credentials: true })`，并 `app.useWebSocketAdapter(new CorsIoAdapter(app, corsOrigins))`。为空时不发任何 CORS 头。
  3. `app.setGlobalPrefix('api')`。
  4. `useGlobalPipes(createValidationPipe())`、`useGlobalFilters(new AllExceptionsFilter())`、`useGlobalInterceptors(new LoggingInterceptor())`。
  5. `app.use(spaFallback)`。
  6. `app.useStaticAssets(STATIC_ROOT, { index: false, fallthrough: true })`（Express 的 `express.static`）。
- **调用方**：`bootstrap.ts → createApp`。
- **实现说明**：两个中间件都在 `app.init()` 之前直接注册到 Express，所以排在 Nest 路由和 Nest 的 404 处理之前。`spaFallback` 只处理不带扩展名、不以 `/api/`、`/socket.io` 开头的 GET/HEAD，不会遮住接口和静态资源；静态中间件找不到文件时交给后面（最终是 Nest 的 404 `not-found` 信封），所以不存在的资源不会拿到 `index.html`。请求体解析错误（400、413）由 Nest 的异常处理交给 `AllExceptionsFilter`，中间没有别的错误中间件。

### `swagger.ts`

生成 OpenAPI 文档。单测：无（`test/api-contract.e2e-spec.ts` 检查文档内容）。

#### `ADMIN_TOKEN_HEADER = 'X-Admin-Token'`

- **作用**：Swagger 里管理口令请求头的名字。
- **调用方**：`buildSwaggerDocument`。守卫里读的是小写 `x-admin-token`，不引用这个常量。

#### `buildSwaggerDocument(app: INestApplication): OpenAPIObject`

- **作用**：用 `DocumentBuilder` 设置标题 `VanManga API`、描述（信封格式）、版本 `0.2.0`、五个标签（`config`、`library`、`download`、`scraper`、`kavita`）、名为 `admin-token` 的 apiKey 安全方案（请求头 `X-Admin-Token`），再 `SwaggerModule.createDocument(app, config)`。各路由的说明来自控制器上的 `@ApiTags`、`@ApiOperation`、`@ApiSecurity('admin-token')` 等装饰器。
- **调用方**：`bootstrap.ts → createApp`；`test/api-contract.e2e-spec.ts`（检查路由清单与安全声明）。

---

## 2. 配置 `config/`

### `config/configuration.ts`

把环境变量读成类型化的 `AppConfig`。单测：有（`configuration.spec.ts`）。

#### `interface AppConfig`

字段结构见下表。各服务用 `ConfigService<AppConfig, true>` 的 `get('a.b', { infer: true })` 读取。

#### `intEnv(name, fallback, min): number`（文件内函数）

- **作用**：读一个整数环境变量。未设置或只有空白 → 返回 `fallback`。否则必须匹配 `/^\d+$/`、`>= min`、且是安全整数，不满足则抛 `Error`：`Invalid ${name}=${JSON.stringify(原值)}: expected a whole number >= ${min}`。
- **调用方**：默认导出函数里的每个数值字段。
- **实现说明**：注释的理由：`parseInt('two')` 得到 `NaN`（例如章节并发为 `NaN` 会让下载全部卡住），`parseInt('2abc')` 静默得到 2。在启动时抛错，错误信息里带变量名。因为 `configuration()` 在 `ConfigModule.forRoot` 加载时执行，这个错误会让 `NestFactory.create` 失败，进程退出。负数因为正则不允许 `-` 一律拒绝。

#### 默认导出 `(): AppConfig`

- **作用**：读取全部环境变量，返回配置对象。另外：设置了旧变量 `LIB_PATH` 而没有设置 `LIBRARY_FILE` 时，`Logger.warn` 提示 `LIB_PATH is set but no longer read; …`（注释：Flask 版读 `LIB_PATH`，静默忽略会让用户以为库被清空）。
- **调用方**：`config/config.module.ts`（`load: [configuration]`），由 Nest 在启动时调用一次（`cache: true`）。
- **实现说明**：路径类变量都经过 `path.resolve`，相对路径按进程当前目录解析。`npm start` 在 `backend/` 下运行，所以 `../scrape_cli.py` 指向仓库根目录；镜像里这些变量都设成了绝对路径（见第 15 节）。

环境变量对照表：

| 环境变量 | 配置字段 | 默认值 | 解析规则 | 读取方 |
|---|---|---|---|---|
| `PORT` | `port` | `5000` | `intEnv`，`>= 0` | `main.ts → bootstrap` |
| `NODE_ENV` | `nodeEnv` | `'development'` | 原样 | 生产代码无读取方 |
| `DOWNLOAD_ROOT` | `storage.downloadRoot` | `resolve('./downloaded')` | `resolve` | `FilesystemService` 构造函数、`LibraryService` 构造函数 |
| `LIBRARY_FILE` | `storage.libraryFile` | `resolve('./eng_config/manga_library.json')` | `resolve` | `LibraryRepository` 构造函数；`storage.queueFile` 的默认值也由它推出 |
| `THUMBNAILS_DIR` | `storage.thumbnailsDir` | `resolve('./thumbnails')` | `resolve` | `ThumbnailService` 构造函数 |
| `QUEUE_FILE` | `storage.queueFile` | `LIBRARY_FILE` 同目录下的 `queue.json` | `resolve(QUEUE_FILE \|\| join(dirname(libraryFile), 'queue.json'))`（用 `\|\|`，空串也走默认） | `TaskQueueService` 构造函数 |
| `NUMBER_OF_WORKERS` | `concurrency.workers` | `2` | `intEnv`，`>= 1` | `DownloadOrchestratorService` 构造函数（同时下载的章节数） |
| `IMAGE_CONCURRENCY` | `download.imageConcurrency` | `1` | `intEnv`，`>= 1` | `ImageDownloaderService` 构造函数（每章并发下载的图片数） |
| `IMAGE_DELAY_MS` | `download.imageDelayMs` | `1000` | `intEnv`，`>= 0` | `ImageDownloaderService` 构造函数（礼貌延迟基数，0 关闭） |
| `DOWNLOAD_PROGRESS_INTERVAL_MS` | `download.progressIntervalMs` | `10000` | `intEnv`，`>= 0` | `ImageDownloaderService` 构造函数（进度日志间隔，0 关闭） |
| `SEARCH_CACHE_TTL_MS` | `searchCache.ttlMs` | `1_800_000`（30 分钟） | `intEnv`，`>= 1` | `SearchCacheService` 构造函数 |
| `SEARCH_CACHE_MAX_ENTRIES` | `searchCache.maxEntries` | `500` | `intEnv`，`>= 1` | `SearchCacheService` 构造函数 |
| `KAVITA_BASE_URL` | `kavita.baseUrl` | `''` | 原样 | `KavitaService.baseUrl` |
| `KAVITA_EXPOSE_URL` | `kavita.exposeUrl` | `''` | 原样 | `KavitaService.exposeUrl`、`FrontendController` 构造函数 |
| `KAVITA_ADMIN_APIKEY` | `kavita.adminApiKey` | `''` | 原样 | `KavitaService.adminApiKey` |
| `KAVITA_LIB_ID` | `kavita.libId` | `1` | `intEnv`，`>= 0` | `KavitaService.libId` |
| （派生） | `kavita.enabled` | — | 上面三个 URL/Key 都非空才为 `true`（注释：与 Flask 相同，否则请求会发到相对地址） | `KavitaService.enabled`、`FrontendController` 构造函数 |
| `FLARESOLVERR_URL` | `flaresolverr.url` | `''` | 原样 | `CloudflareService.solveChallenge` |
| （派生） | `flaresolverr.enabled` | — | `url` 非空 | `CloudflareService.isEnabled` |
| `ADMIN_TOKEN` | `security.adminToken` | `''` | `trim()` | `AdminTokenGuard.canActivate`、`FrontendController` 构造函数 |
| `CORS_ORIGINS` | `security.corsOrigins` | `[]` | 按 `,` 拆分、`trim`、去掉空项 | `app.setup.ts → configureApp` |
| `PYTHON_EXECUTABLE` | `python.executable` | `'python'` | 原样 | `PythonRunnerService.run` |
| `PYTHON_CLI_SCRIPT` | `python.cliScript` | `resolve('../scrape_cli.py')` | `resolve` | `PythonRunnerService.run` |
| `PYTHON_WORKING_DIR` | `python.workingDir` | `resolve('..')` | `resolve` | `PythonRunnerService.run`（子进程 `cwd`，必须包含 `modules/`） |
| `PYTHON_TIMEOUT_MS` | `python.timeoutMs` | `180_000` | `intEnv`，`>= 1` | `PythonRunnerService.run` |
| `LIB_PATH`（旧） | — | — | 只用来告警 | 默认导出函数 |

### `config/config.module.ts`

#### `ConfigModule`（`@Global()`）

- **作用**：用 `@nestjs/config` 的 `ConfigModule.forRoot` 注册配置：`isGlobal: true`、`load: [configuration]`、`cache: true`、`envFilePath: ['.env.local', '.env']`（相对进程当前目录；前者优先）。
- **调用方**：`AppModule` 导入。单测：无。

---

## 3. 公共设施 `common/`

### `common/events/app.events.ts`

进程内事件名与载荷类型。单测：无。

| 导出 | 值 / 形状 | 用途 |
|---|---|---|
| `DOWNLOAD_COMPLETED` | `'download.completed'` | 见 0.2 |
| `DownloadCompletedEvent` | `{ mangaId: string; mangaName: string }` | 载荷 |
| `MANGA_ADDED` | `'manga.added'` | 见 0.2 |
| `MangaAddedEvent` | `{ mangaId: string }` | 载荷 |
| `QUEUE_CHANGED` | `'queue.changed'` | 载荷是 `QueueSnapshot`（`download/queue/task.types.ts`），本文件没有为它单独定义类型 |

### `common/http/envelope.ts`

成功信封。单测：无。

- `interface ApiSuccess<T> { code: 200; data: T }`
- `ok<T>(data: T): ApiSuccess<T>`
  - **作用**：返回 `{ code: 200, data }`。
  - **调用方**：所有控制器的成功分支（`FrontendController.getConfig`、`LibraryController.list/add/toggle/delete`、`DownloadController` 全部六个方法、`ScraperController` 除 `searchThumbnail` 外的五个方法、`KavitaController.login/refreshToken`）。

### `common/http/api-exception.ts`

带机器可读错误码的异常。单测：无（经 `all-exceptions.filter.spec.ts` 间接覆盖）。

#### `class ApiException extends HttpException`

- **作用**：`constructor(status, error, options: { message?, data? } = {})`。调用 `super(options.message ?? error, status)`，保存 `errorCode = error`、`data = options.data`。全局过滤器把它渲染成 `{ code: status, error, message?, data? }`。
- **调用方**：`AdminTokenGuard.canActivate`（`admin-token-required`、`admin-token-invalid`）、`LibraryController.add/delete`（`duplicate`、`already-in-library`、`search-expired`、`manga-busy`、`delete-failed`）、`ScraperController.search`（`query-required`）、`scrape-errors.ts`（`scraper-blocked`、`dmca`、`rate-limited`、`scraper-failed`）、`KavitaController`（`kavita-disabled`、`kavita-login-failed`、`kavita-refresh-failed`、`kavita-unreachable`）。
- **实现说明**：没传 `message` 时 Nest 的响应体就是错误码字符串本身；过滤器发现 `message === error` 时不输出 `message`，所以响应里不会重复。

#### `class MangaNotFoundException extends NotFoundException`

- **作用**：`errorCode = 'manga-not-found'`，消息 `Unknown manga: ${mangaId}`，HTTP 404。
- **调用方**：`LibraryService.get/deleteManga/patch`、`DownloadService.submitFullManga/submitRedownload`。

#### `class UnknownSourceException extends NotFoundException`

- **作用**：`errorCode = 'unknown-source'`，消息 `Unknown manga source: '${name}'. Registered: …`，HTTP 404。
- **调用方**：`SourceRegistryService.get`。

#### `errorCodeOf(exception: unknown): string | undefined`

- **作用**：取异常对象上的字符串 `errorCode` 属性，没有则 `undefined`。
- **调用方**：`AllExceptionsFilter.canonical`（两处）。
- **实现说明**：按属性鸭子类型判断，不依赖 `instanceof`，所以 `MangaNotFoundException` 这类继承自 Nest 内置异常、但不是 `ApiException` 的类也能带错误码。

### `common/http/browser-user-agent.ts`

#### `DEFAULT_BROWSER_USER_AGENT`

- **作用**：常量 `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`。
- **调用方**：`ImageDownloaderService.defaultUserAgent`、`SchedulerService.cfProbe`。
- **实现说明**：注释：dogemanga 在 Cloudflare 后面，即使没有验证，对 `axios/x.y` 这类非浏览器 UA 也回 403。Flask 版一直经 DrissionPage 带浏览器 UA 出去。单测：无。

### `common/filters/all-exceptions.filter.ts`

全局异常过滤器，把任何异常变成失败信封。单测：有（`all-exceptions.filter.spec.ts`）。

#### `DEFAULT_ERRORS`（常量）

`400: 'bad-request'`、`401: 'unauthorized'`、`403: 'forbidden'`、`404: 'not-found'`、`409: 'conflict'`、`413: 'payload-too-large'`、`429: 'rate-limited'`、`500: 'internal-error'`。没有专门错误码时按状态取缺省值，表里没有的状态用 `http-<status>`。

#### `exposedClientStatus(exception: unknown): number | null`（文件内函数）

- **作用**：对 `http-errors` 风格的错误（中间件抛出、`expose === true`、带数值 `status` 或 `statusCode`），且状态在 400–499 之间时返回该状态；否则返回 `null`。
- **调用方**：`AllExceptionsFilter.catch`。
- **实现说明**：注释：用于 body-parser 的 `entity.too.large`（413）、`charset.unsupported`（415）等。其他非 `HttpException` 一律不信任，当 500 处理。格式错误的 JSON 是 `SyntaxError`，Nest 已经把它转成了 `BadRequestException`，不走这里。

#### `class AllExceptionsFilter`（`@Catch()`，捕获一切）

- `catch(exception, host): void`
  - **作用**：确定状态码 → 写日志 → `response.status(status).json(this.canonical(exception, status))`。
  - **调用方**：Nest 在任何 HTTP 处理抛错时调用（由 `configureApp` 注册为全局过滤器）。
  - **实现说明**：状态码：`HttpException` 用 `getStatus()`；否则 `exposedClientStatus(...) ?? 500`。日志：`>= 500` 用 `error` 并带堆栈；其余用 `warn`，只带消息。日志前缀 `[METHOD] url -> status`。
- `canonical(exception, status): CanonicalFailure`（私有）
  - **作用**：生成响应体，规则见下表。
  - **调用方**：`catch`。

映射规则：

| 异常 | `code` | `error` | `message` | `data` |
|---|---|---|---|---|
| 非 `HttpException`，状态 < 500（即 `exposedClientStatus` 认出的中间件错误） | 该状态 | `DEFAULT_ERRORS[status] ?? 'http-<status>'` | 无（只进日志） | 无 |
| 非 `HttpException`，其他 | 500 | `internal-error` | 无（细节只进日志） | 无 |
| `HttpException`，有 `errorCode`（`ApiException`、`MangaNotFoundException`、`UnknownSourceException`） | `getStatus()` | `errorCode` | 见下 | `ApiException` 且 `data !== undefined` 时输出 |
| `HttpException`，无 `errorCode`，响应里 `message` 是数组（`ValidationPipe`），状态 400 | 400 | `validation-failed` | 数组各项用 `'; '` 连接 | 无 |
| `HttpException`，无 `errorCode`，其他 | `getStatus()` | `DEFAULT_ERRORS[status] ?? 'http-<status>'` | 见下 | 无 |

`message` 的来源：`getResponse()` 是字符串就用它，是对象就取 `.message`。是数组时连接成一个字符串；是字符串且不等于 `error` 时输出；否则不输出。例：未知路由 → Nest 的 `NotFoundException('Cannot GET /api/x')` → `{ code: 404, error: 'not-found', message: 'Cannot GET /api/x' }`；超过 1 MB 的请求体 → `{ code: 413, error: 'payload-too-large' }`。

`LibraryController.thumbnail` 与 `ScraperController.searchThumbnail` 用 `@Res()` 直接写 `{ code: 404, error: 'thumbnail-not-found' }`，不经过本过滤器，但形状相同。

### `common/pipes/validation.pipe.ts`

#### `createValidationPipe(): ValidationPipe`

- **作用**：`new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false })`。
- **调用方**：`app.setup.ts → configureApp`；控制器单测也用它保证与生产一致。单测：无。
- **实现说明**：`whitelist: true` 会删掉 DTO 上没有 class-validator 装饰器的属性，所以 DTO 的每个字段都必须带装饰器（`kavita.controller.ts` 的注释特别提醒了这一点）。多余字段被静默丢弃，不报错（`forbidNonWhitelisted: false`）。校验失败时 Nest 抛 `BadRequestException`，`message` 为数组，过滤器把它变成 `validation-failed`。

### `common/interceptors/logging.interceptor.ts`

#### `class LoggingInterceptor`（`@Injectable()`）

- `intercept(context, next)`
  - **作用**：记下开始时间，处理成功后（`tap`）以 `HTTP` 为上下文写 `${method} ${url} ${ms}ms`。
  - **调用方**：Nest，对每个进入控制器的请求（由 `configureApp` 注册为全局拦截器）。单测：无。
  - **实现说明**：只在成功路径记日志；抛错的请求由 `AllExceptionsFilter` 记日志。用 `@Res()` 直接写响应的两个封面路由，处理函数返回 `undefined` 后照样会记一行。

### `common/security/admin-token.guard.ts`

管理口令守卫。单测：有（`admin-token.guard.spec.ts`）。

#### `tokensMatch(given: string, expected: string): boolean`

- **作用**：两边各算 SHA-256，再用 `crypto.timingSafeEqual` 比较 32 字节摘要。
- **调用方**：`AdminTokenGuard.canActivate`。
- **实现说明**：注释：先哈希得到等长输入（`timingSafeEqual` 要求等长），这样口令的内容和长度都不会通过响应时间泄露。

#### `class AdminTokenGuard`（`@Injectable()`，`CanActivate`）

- 构造依赖：`ConfigService<AppConfig, true>`。
- `canActivate(context): boolean`
  - **作用**：
    1. `security.adminToken` 为空 → 放行（不启用保护）。
    2. 请求头 `x-admin-token` 为 `undefined` 或空串 → 抛 `ApiException(401, 'admin-token-required', { message: 'This server requires the X-Admin-Token header' })`。
    3. 请求头不是字符串，或 `tokensMatch` 为假 → 抛 `ApiException(401, 'admin-token-invalid')`。
    4. 否则放行。
  - **调用方**：Nest，用于 `@UseGuards(AdminTokenGuard)` 的两条路由：`DELETE /api/library/:mangaId`（`LibraryController.delete`）、`POST /api/library/rezip`（`DownloadController.rezip`）。
  - **实现说明**：配置里的口令已经 `trim()`，请求头不做 `trim()`。

### `common/security/cors-io.adapter.ts`

#### `class CorsIoAdapter extends IoAdapter`

- 构造依赖：`app: INestApplicationContext`、`origins: string[]`。
- `createIOServer(port, options)`
  - **作用**：在 Nest 传入的选项上加 `cors: { origin: this.origins, credentials: true }` 后调用父类，让 Socket.IO 只给列出的来源发 CORS 头。
  - **调用方**：Nest 创建网关服务器时调用；适配器只在 `CORS_ORIGINS` 非空时由 `configureApp` 安装。单测：无（`test/cors.e2e-spec.ts` 覆盖）。

### `common/security/trust-store-check.ts`

单测：有（`trust-store-check.spec.ts`，用 `common/security/__fixtures__/emsign-ecc-root-ca-g3.pem` 作样本）。

#### `REVOKED_ROOT_CNS = ['emSign ECC Root CA - G3']`

- **作用**：不允许出现在 Node 内置信任库里的根证书 CN 列表。
- **实现说明**：注释：该根下 8 个中间证书的 P-384 私钥落在 1–255 之间，已于 2026 年 10 月作为泄露被吊销；NSS 3.131.1 移除了该根，Node 在 22.23.4 / 24.22.1 / 26.12.1 跟进。旧版 Node 仍信任它，任何人都能为 dogemanga.com 或 Kavita 伪造 axios 会接受的证书。

#### `findRevokedRoots(pems = tls.rootCertificates): string[]`

- **作用**：对每个 PEM 构造 `X509Certificate`，取 `subject`，按 `\n` 拆行后看是否含 `CN=<名单中的 CN>`，返回命中的 CN 列表。
- **调用方**：`main.ts → bootstrap`（不传参，检查 Node 内置的 `rootCertificates`）。
- **实现说明**：只检查 Node 自带的 CA 列表，不检查系统证书库或 `NODE_EXTRA_CA_CERTS`。

---

## 4. 漫画库 `modules/library/`

### `library/library.module.ts`

见 0.1。单测：无。

### `library/entities/manga.entity.ts`

单测：无。

#### `interface Manga`

库里一条记录。字段名与 Flask 版 `manga_library.json` 完全一致，旧文件不用迁移。

| 字段 | 类型 | 含义 |
|---|---|---|
| `manga_id` | `string` | 源站 id，也是库对象的键 |
| `manga_name` | `string` | 名称 |
| `artist_name` | `string` | 作者 |
| `newest_epi` | `string` | 添加时搜索结果里的最新话名 |
| `thumbnail` | `string` | 封面地址。P2 之后新记录存 `/api/library/<id>/thumbnail`；旧记录可能是带域名的绝对地址。对外输出时由 `toApiManga` 统一 |
| `last_epi` | `number` | 已下载的最大章节序号（1 起）。新记录为 1 |
| `last_epi_name` | `string` | 该章节改写后的名字 |
| `completed` | `boolean` | 首次全量下载是否完成 |
| `serialization` | `0 \| 1` | 0 连载中，1 已完结（源站状态） |
| `download_switch` | `0 \| 1` | 0 自动更新开启，1 暂停 |
| `add_date` | `number` | 加入时间，unix 秒，写入后不改 |
| `updated_at?` | `number` | 最近更新时间，unix 秒；P2 前的记录没有 |
| `source?` | `string` | 抓取源名；旧记录没有，读取时按 `'dgmanga'` |
| `kavita_url?` | `string` | Kavita 系列地址；默认字符串 `'None'`（沿用 2.1-dev） |
| `recent_update_date?` | `string` | 部分源在搜索时提供 |

#### `type MangaLibrary = Record<string, Manga>`

磁盘文件的形状：以 `manga_id` 为键的对象。

### `library/dto/add-manga.dto.ts`

单测：无。

- `interface AddMangaInput { manga_id: string; source: string; submit_sign?: '0' | '1' | '2' }`：`LibraryService.addManga` 的入参。`'0'` 或省略：查重；`'1'`：已确认，跳过查重；`'2'`：取消。由 `LibraryController.add` 构造。
- `interface DuplicateCheckResponseDto { duplicates: string[]; needsConfirmation: boolean }`：`LibraryService.checkDuplicates` 的返回值。

### `library/dto/lean-add-manga.dto.ts`

#### `class LeanAddMangaDto`

- **作用**：`POST /api/library` 的请求体校验。`manga_id`：`@IsString() @IsNotEmpty()`；`source`：`@IsString() @IsNotEmpty()`；`submit_sign`：`@IsOptional() @IsIn(['0','1','2'])`。其他字段被 `ValidationPipe` 删掉。
- **调用方**：`LibraryController.add` 的 `@Body()`。单测：无。

### `library/dto/index.ts`

重新导出 `add-manga.dto` 与 `lean-add-manga.dto`。

### `library/manga-view.ts`

把存储记录转成对外形态。单测：有（`manga-view.spec.ts`）。

#### `interface ApiManga`

`Manga` 去掉 `source`、`kavita_url`、`updated_at` 的可选性：`source: string`、`kavita_url: string | null`、`updated_at: number`。

#### `thumbnailPath(mangaId: string): string`

- **作用**：返回 `/api/library/${encodeURIComponent(mangaId)}/thumbnail`。
- **调用方**：`toApiManga`。

#### `toApiManga(m: Manga): ApiManga`

- **作用**：复制记录并归一化：`manga_id` 转为字符串；`thumbnail` 一律改成 `thumbnailPath(id)`；`source` 缺省为 `'dgmanga'`；`kavita_url` 为空或 `'None'` 时为 `null`；`updated_at` 缺省为 `add_date`。其他字段（包括旧记录里的未知字段）原样保留。
- **调用方**：`LibraryController.list`、`LibraryController.add`（409 `already-in-library` 的 `data.manga` 和成功结果）、`DownloadOrchestratorService.processOneChapter`（`chapter_completed` 载荷）、`DownloadOrchestratorService.announceEnd`（`download_completed` 的 `manga`）。
- **实现说明**：注释：旧记录里的封面地址带 `MANGA_BASE_URL` 前缀或是 `/api/dogemanga/...`，但磁盘上的文件永远是 `<id>.jpg`，所以地址可以直接推出来；归一化只在读取时做，库文件本身从不迁移。

### `library/send-thumbnail.ts`

#### `sendThumbnail(thumbnails, mangaId, res, notFoundBody): Promise<void>`

- **作用**：用 `ThumbnailService.getThumbnailPath` 拿封面路径，`res.sendFile(path, { dotfiles: 'allow' })` 流式返回。拿路径失败或发送失败时，若响应头尚未发出，回 `404` + `notFoundBody`。
- **调用方**：`LibraryController.thumbnail`。单测：无（经 `library.controller.spec.ts` 覆盖，未逐项确认）。
- **实现说明**：`dotfiles: 'allow'` 的理由（注释）：路径由服务端用校验过的 id 拼出，允许数据目录位于点开头的目录下（例如 `~/.vanmanga`），而 `send` 默认拒绝这种路径。

### `library/library.repository.ts`

`manga_library.json` 的唯一读写者。单测：有（`library.repository.spec.ts`）。

构造依赖：`ConfigService`（读 `storage.libraryFile`）、`FilesystemService`。

状态字段：`library: MangaLibrary`（内存里的整个库）、`loaded: boolean`（文件已读入或已新建）、`writeQueue: Promise<unknown>`（写入串行化链）。

#### `onModuleInit(): Promise<void>`

- **作用**：`await this.load()`。
- **调用方**：由 Nest 在启动时调用。

#### `load(): Promise<void>`（私有）

- **作用**：
  - 文件不存在：建父目录，内存设为 `{}`，`flushAtomic({})` 写出空库，`loaded = true`，日志 `Created new manga library at …`。
  - 文件存在但读不了或不是合法 JSON：抛 `Error`（`Cannot read manga library at … Refusing to start so the file is not overwritten; repair or restore it, then restart.`，`cause` 为原错误）。
  - 是 JSON 但不是对象（`null`、数组、标量）：抛 `Error`（`… is not a JSON object. Refusing to start …`）。
  - 否则载入内存，`loaded = true`，日志 `Loaded N manga from …`。
- **调用方**：`onModuleInit`。
- **实现说明**：读不了就拒绝启动，而不是从空库开始。注释的理由：从空库开始的话，下一次修改会把用户真实的文件覆盖成 `{}`。Flask 版在这种情况下导入时就崩溃。抛出的错误让 `NestFactory.create` 失败，进程退出。

#### `flushAtomic(snapshot): Promise<void>`（私有）

- **作用**：`JSON.stringify(snapshot, null, 4)` 写到 `<libraryFile>.tmp`，再 `fs.rename` 覆盖正式文件。
- **调用方**：`load`（新建空库时）、`mutate`。
- **实现说明**：先写临时文件再改名，进程中途崩溃不会留下写了一半的库文件（改名在同一文件系统内是原子的）。没有 `fsync`。缩进 4 空格与 Flask 版一致。

#### `mutate<T>(fn): Promise<T>`（私有）

- **作用**：把"改内存 + 写盘"排进 `writeQueue`：等前一个写入结束 → 若 `!loaded` 抛 `Manga library is not loaded; refusing to write` → 执行 `fn(this.library)` → `flushAtomic` → 返回 `fn` 的结果。
- **调用方**：`add`、`update`、`remove`、`replaceAll`。
- **实现说明**：
  - 串行化：注释说 Flask 版靠 Python 的 GIL，Node 需要显式的互斥。每次写盘都写的是当时整个内存库，所以最后一次写入总是反映最新状态。
  - `writeQueue = next.catch(() => undefined)`：一次写入失败只让它自己的 Promise 拒绝，后面的写入照常排队执行。
  - `fn` 先改内存再写盘。写盘失败时内存里的修改不回滚，内存与磁盘暂时不一致，直到下一次成功写入把整个库写出去。
  - 修改要等前面的写入完成后才生效，所以调用 `add()` 之后、Promise 完成之前，`has()` 仍可能返回 `false`。
  - `loaded` 守卫保证未读入的空库永远到不了磁盘。

#### 读方法

| 方法 | 作用 | 调用方 |
|---|---|---|
| `list(): Manga[]` | `Object.values(this.library)` | `LibraryService.list`、`LibraryService.checkDuplicates`、`SchedulerService.bootScan` |
| `has(id): boolean` | `id in this.library` | `LibraryService.has`、`LibraryService.addManga`、`KavitaService.syncLibrary`、`SchedulerService.bootScan`、`SchedulerService.submit` |
| `get(id): Manga \| undefined` | 返回内存里的对象（不是拷贝） | `LibraryService.get`、`LibraryService.addManga`、`LibraryService.deleteManga` |
| `size(): number` | 记录数 | 生产代码无调用方 |
| `snapshot(): MangaLibrary` | 返回内存库本身的引用（注释：不要修改） | 生产代码无调用方（单测使用） |

`list()` 的顺序是 JS 对象键的顺序：整数形式的键排在最前并按数值升序，其余按插入顺序。DogeManga 的 id 不是纯数字，所以实际就是加入顺序（是否会出现纯数字 id 未确认）。

#### 写方法

| 方法 | 作用 | 调用方 |
|---|---|---|
| `add(manga): Promise<void>` | `lib[manga.manga_id] = manga`，写盘 | `LibraryService.addManga` |
| `update(id, patch): Promise<Manga \| undefined>` | 记录存在时用 `{ ...current, ...patch }` 替换并返回新对象；不存在返回 `undefined`（仍会写一次盘） | `LibraryService.toggleAutoUpdate`、`LibraryService.patch`、`KavitaService.syncLibrary` |
| `remove(id): Promise<boolean>` | 删除记录，返回是否存在 | `LibraryService.deleteManga` |
| `replaceAll(library): Promise<void>` | 清空同一个对象再 `Object.assign`，保持引用不变 | 生产代码无调用方 |

`update` 用新对象替换，所以之前通过 `get()` 拿到的对象不会看到这次修改。`DownloadOrchestratorService` 因此在需要最新值时都会重新 `library.get()`。

### `library/library.service.ts`

漫画库的业务逻辑。单测：有（`library.service.spec.ts`）。

构造依赖：`LibraryRepository`、`MangaFactoryService`、`DuplicateCheckService`、`ThumbnailService`、`FilesystemService`、`SearchCacheService`、`ConfigService`（读 `storage.downloadRoot`）。

状态：`deleting: Set<string>`，正在删除的 id。

#### `interface AddMangaOutcome`

`{ status: 'added' | 'duplicate' | 'cancelled' | 'exists' | 'expired'; manga?: Manga; duplicates?: string[] }`。

#### `list(): Manga[]`

- **作用**：`repo.list()`。
- **调用方**：`LibraryController.list`。

#### `get(mangaId): Manga`

- **作用**：返回记录；没有则抛 `MangaNotFoundException`（404 `manga-not-found`）。
- **调用方**：`LibraryService.toggleAutoUpdate`、`DownloadController.chapters`、`DownloadOrchestratorService.runFullManga/runRedownload/processOneChapter/announceEnd`。
- **实现说明**：只看仓库，不看 `deleting`，所以删除进行中仍能取到记录。

#### `has(mangaId): boolean`

- **作用**：`repo.has(id) && !deleting.has(id)`。
- **调用方**：`DownloadService.submitFullManga/submitRedownload`、`DownloadOrchestratorService.processChapters`、`LibraryController.thumbnail`。
- **实现说明**：注释：删除进行中返回 `false`，这样在删除的忙碌检查之后、记录真正移除之前，既不会有下载被排入（`DownloadService`），也不会有任务重新建出目录（编排器）。

#### `checkDuplicates(name): DuplicateCheckResponseDto`

- **作用**：`dedupe.findCloseMatches(name, repo.list())`，`needsConfirmation = duplicates.length > 0`。
- **调用方**：`LibraryService.addManga`。

#### `addManga(input: AddMangaInput): Promise<AddMangaOutcome>`

- **作用**：按顺序：
  1. `submit_sign === '2'` → `{ status: 'cancelled' }`。
  2. 库里已有该 id → `{ status: 'exists', manga }`。
  3. 搜索缓存 `searchCache.get(source, manga_id)` 未命中 → `{ status: 'expired' }`。
  4. `submit_sign !== '1'` 时查重，有相近标题 → `{ status: 'duplicate', duplicates }`。
  5. `candidate = { ...cached, source: input.source }` → `thumbnails.persistAndLink(candidate)`（把 base64 封面写成 `<thumbnailsDir>/<id>.jpg`，并把 `thumbnail` 改成相对地址）→ `factory.build(...)` → `repo.add(manga)` → 日志 `=== MANGA ADDED: … ===` → `{ status: 'added', manga }`。
- **调用方**：`LibraryController.add`（它负责把结果映射成 HTTP 状态并发 `manga.added`）。
- **实现说明**：
  - 第 2 步在第 3 步之前：已在库中的漫画即使缓存过期也返回 `exists`。
  - `source` 未注册时缓存里不可能有该候选，结果是 `expired`（契约第 3.3 节写明）。
  - 不会发事件；事件由控制器发。
  - 封面先写盘再写库：写库失败会留下一个孤立的封面文件。
  - 两个并发的同 id 添加都可能通过第 2 步（`repo.add` 要排队写入后 `has` 才为真），后一个覆盖前一个，数据相同；两次 `manga.added` 在队列里去重。

#### `toggleAutoUpdate(mangaId): Promise<0 | 1>`

- **作用**：`download_switch` 为 1 时改成 0，否则改成 1；`repo.update` 写盘；返回新值。不存在抛 404。
- **调用方**：`LibraryController.toggle`。

#### `deleteManga(mangaId): Promise<boolean>`

- **作用**：
  1. 取记录，不存在抛 `MangaNotFoundException`。
  2. 算出下载目录 `join(downloadRoot, mangaFolderName(manga_name, id))`。
  3. `deleting.add(id)`。
  4. 目录存在则 `removeDir`；删除失败 → 错误日志，返回 `false`（记录保留）。
  5. `repo.remove(id)`。
  6. `finally`：`deleting.delete(id)`。
  7. `thumbnails.remove(id)`（尽力而为，不抛错），日志 `=== MANGA DELETED: … ===`，返回 `true`。
- **调用方**：`LibraryController.delete`（返回 `false` 时回 500 `delete-failed`）、`DownloadOrchestratorService.handleDmca`。
- **实现说明**：
  - 不检查是否在下载或排队，这个检查由控制器做（注释：`LibraryModule` 不导入 `DownloadModule`）。DMCA 删除发生在该漫画自己的任务里，本来就不能做忙碌检查。
  - `deleting.add` 在第一个 `await` 之前同步执行。`LibraryController.delete` 的 `isMangaBusy` 检查与 `deleteManga` 的调用之间也没有 `await`，所以"检查不忙 → 标记删除中"在同一轮事件循环里完成，期间不可能插入新的入队。这是提交 `bf1c533` 修的"删除与下载竞争导致孤立目录"问题。
  - 先删目录再删记录：目录删不掉时记录还在，用户可以重试；反过来会留下没有记录的目录。

#### `patch(mangaId, patch): Promise<Manga>`

- **作用**：`repo.update`，返回新记录；记录不存在抛 `MangaNotFoundException`。
- **调用方**：`DownloadOrchestratorService.runFullManga`（完成时）、`runRedownload`（`updated_at`）、`processOneChapter`（推进 `last_epi`）。
- **实现说明**：方法注释说 Kavita 同步和定时任务也用它，实际上 `KavitaService.syncLibrary` 直接调 `LibraryRepository.update`，`SchedulerService` 不写库。

### `library/library.controller.ts`

`@ApiTags('library')`、`@Controller('library')`。单测：有（`library.controller.spec.ts`）。

构造依赖：`LibraryService`、`ThumbnailService`、`TaskQueueService`（来自全局 `DownloadModule`）、`EventEmitter2`。

#### `list()` — `GET /api/library`

- **作用**：`ok(library.list().map(toApiManga))`。
- **调用方**：HTTP 路由。

#### `add(@Body() body: LeanAddMangaDto)` — `POST /api/library`，`@HttpCode(200)`

- **作用**：调用 `library.addManga({ manga_id, source, submit_sign })`，再映射：

| `outcome.status` | 结果 |
|---|---|
| `cancelled` | `200 { status: 'cancelled' }` |
| `duplicate` | `409 duplicate`，`message: 'Similar manga already in the library; resubmit with submit_sign=1'`，`data: { duplicates }` |
| `exists` | `409 already-in-library`，`data: { manga: toApiManga(...) }` |
| `expired` | `410 search-expired`，`message: 'Candidate no longer in the search cache; search again'` |
| `added` | 先 `eventEmitter.emit(MANGA_ADDED, { mangaId })`，再 `200 { status: 'added', manga: toApiManga(manga) }` |

- **调用方**：HTTP 路由。
- **实现说明**：`emit` 同步执行监听器，返回响应时下载任务已入队（见 0.2）。

#### `toggle(@Param('mangaId'))` — `POST /api/library/:mangaId/auto-update`，`@HttpCode(200)`

- **作用**：`ok({ currentDownloadStatus: await library.toggleAutoUpdate(id) })`；不存在 → 404 `manga-not-found`。
- **调用方**：HTTP 路由。

#### `delete(@Param('mangaId'))` — `DELETE /api/library/:mangaId`，`@UseGuards(AdminTokenGuard)`、`@ApiSecurity('admin-token')`

- **作用**：
  1. `taskQueue.isMangaBusy(id)` 为真 → `409 manga-busy`（`message: 'Manga is downloading or queued'`）。
  2. `library.deleteManga(id)` 返回 `false` → `500 delete-failed`（`message: 'Could not remove the download folder; record kept'`）；记录不存在 → 404 `manga-not-found`（由 `deleteManga` 抛出）。
  3. 成功 → `ok(true)`。
- **调用方**：HTTP 路由。
- **实现说明**：忙碌检查在 404 检查之前：一个不存在的 id 若恰好在队列里，回 409。

#### `thumbnail(@Param('mangaId'), @Res() res)` — `GET /api/library/:mangaId/thumbnail`

- **作用**：`library.has(id)` 为假（不存在或删除中）→ 直接写 `404 { code: 404, error: 'thumbnail-not-found' }`；否则 `sendThumbnail(...)`。
- **调用方**：HTTP 路由。

### `library/services/duplicate-check.service.ts`

相似标题查重。单测：有（`duplicate-check.service.spec.ts`）。

#### `findCloseMatches(candidateName, library, { cutoff = 0.6, maxResults = 10 } = {}): string[]`

- **作用**：返回库中与候选名足够相近的标题，按相似度从高到低，最多 `maxResults` 个。
- **调用方**：`LibraryService.checkDuplicates`（用默认参数）。
- **实现说明**：
  - 归一化：`toLowerCase().trim()`。
  - 候选名的二元组为空（归一化后是空串）→ 返回 `[]`。
  - 归一化后完全相同 → 得分 1，直接收入（不受 `cutoff` 影响）。
  - 否则算二元组 Dice 系数：`2 × 交集 ÷ (A 的二元组总数 + B 的二元组总数)`，交集按每个二元组在两边出现次数的较小值累加（多重集）。`>= cutoff` 时收入。
  - 只有一个字符的字符串，二元组集合就是该字符本身（计数 1）。
  - 注释：Python 版用 `difflib.get_close_matches`（Ratcliff-Obershelp），这里用 Dice 近似；`cutoff` 0.6 与 difflib 默认相同。两者结果不完全一致。

例 1（e2e 里的真实数据）：库里有 `E2E Manga`，新候选 `E2E Manga!`。

- `e2e manga` 的二元组（8 个）：`e2`、`2e`、`e␣`、`␣m`、`ma`、`an`、`ng`、`ga`
- `e2e manga!` 的二元组（9 个）：上面 8 个 + `a!`
- 交集 8，Dice = 2×8 ÷ (8+9) = 16/17 ≈ 0.94 ≥ 0.6 → 判为相似，`POST /api/library` 回 409 `duplicate`。

例 2：库里有 `Fate`，新候选 `Fate Zero`。

- `fate`：`fa`、`at`、`te`（3 个）
- `fate zero`：`fa`、`at`、`te`、`e␣`、`␣z`、`ze`、`er`、`ro`（8 个）
- 交集 3，Dice = 6/11 ≈ 0.55 < 0.6 → 不算相似，直接添加。

#### `normalise(s)`、`bigrams(s)`、`dice(a, b)`（私有）

- **作用**：见上面的实现说明。`bigrams` 返回 `Map<二元组, 次数>`。
- **调用方**：`findCloseMatches`。

### `library/services/manga-factory.service.ts`

单测：有（`manga-factory.service.spec.ts`）。

#### `build(candidate: SearchResultDto): Manga`

- **作用**：用搜索候选（其 `thumbnail` 已改成封面地址）生成新记录。复制 `manga_id`、`manga_name`、`artist_name`、`newest_epi`、`thumbnail`、`recent_update_date`，`source` 缺省 `'dgmanga'`；默认值：`last_epi: 1`、`last_epi_name: ''`、`completed: false`、`serialization: 0`、`download_switch: 0`、`kavita_url: 'None'`；`add_date` 与 `updated_at` 都是 `Date.now() / 1000`。
- **调用方**：`LibraryService.addManga`。
- **实现说明**：默认值与 `utils/make_manga_object.py` 一致（注释）。`add_date`、`updated_at` 是带小数的秒（没有取整），而下载过程写入的 `updated_at` 是取整的秒（`DownloadOrchestratorService.nowSeconds`）。`last_epi` 从 1 起而不是 0，是旧格式的约定，编排器据此判断"从未下载"（见第 6 节 `runFullManga`）。

---

## 5. 抓取 `modules/scraper/` 与搜索缓存 `modules/search-cache/`

### `scraper/scraper.module.ts`

见 0.1。单测：无。

#### `sources = [DGmangaSource]`（常量）

- **作用**：所有抓取源类。既作为 provider 注册，又通过 `MANGA_SOURCE_TOKEN` 工厂 `(...impls) => impls` 收集成数组注入 `SourceRegistryService`。
- **实现说明**：文件注释写了新增抓取源的三步：在 `sources/` 下加实现 `IMangaSource` 的类；加进这个数组；在 `scrape_cli.py` 的 `SOURCE_REGISTRY` 登记对应的 Python 处理函数。

### `scraper/interfaces/manga-source.interface.ts`

单测：无。

#### `interface IMangaSource`

| 成员 | 含义 |
|---|---|
| `readonly name: string` | 稳定标识，用在路由和注册表里，如 `'dgmanga'` |
| `readonly displayName: string` | 显示名 |
| `search(query): Promise<SearchResultDto[]>` | 按标题搜索，约 10 个候选 |
| `getMetadata(mangaId): Promise<MangaMetadataDto>` | 章节数与连载状态 |
| `getChapters(mangaId): Promise<ChapterListResultDto>` | 完整章节列表，升序 |
| `getChapterImages(chapterUrl): Promise<ChapterImagesDto>` | 一章的图片地址与请求头 |

注释里提到的"Bull jobs"在当前代码中不存在（队列是自写的 `TaskQueueService`）。

#### `MANGA_SOURCE_TOKEN = Symbol('MANGA_SOURCE')`

- **作用**：注入 `IMangaSource[]` 的令牌。
- **调用方**：`scraper.module.ts`（提供）、`SourceRegistryService` 构造函数（`@Inject`）。

### `scraper/dto/*.ts`

单测：无。都是接口，没有运行时代码。

| 文件 | 类型 | 字段 |
|---|---|---|
| `search-result.dto.ts` | `SearchResultDto` | `manga_id`、`manga_name`、`artist_name`、`newest_epi`、`thumbnail`（base64 JPG）、`recent_update_date?`、`source?`（由 Node 设置，不来自 Python） |
| `manga-metadata.dto.ts` | `MangaMetadataDto` | `chapterCount`、`serialization: 0 \| 1`、`errorCode?: 501 \| 503 \| 504`（注释：501 Cloudflare、503 重试用尽后的抓取错误、504 DMCA） |
| `chapter.dto.ts` | `ChapterDto` | `index`（序号）、`title`、`url` |
| `chapter.dto.ts` | `ChapterListResultDto` | `chapters: ChapterDto[]`、`errorCode?: 501 \| 503 \| 504` |
| `chapter-images.dto.ts` | `ChapterImagesDto` | `chapterTitle`、`imageUrls`、`requestHeaders?`、`errorCode?: 429 \| 501 \| 503` |
| `index.ts` | — | 重新导出以上四个文件 |

`ChapterDto.title` 的注释说"已为文件系统归一化"，并举例 `"第 12 話"`。实际上 Node 侧还要经 `reformatChapterTitle` 和 `sanitiseTitle` 处理；Python 侧 `comic_main_page` 会删掉标题中的所有空格（见 14.2），所以源站标题里的空格到不了 Node。

### `scraper/python/python-runner.types.ts`

单测：无。

- `interface PythonResult<T> { ok: boolean; data?: T; errorCode?: number | null; error?: string }`：`scrape_cli.py` 输出的那一行 JSON。
- `interface PythonRunOptions { source; command; args: string[]; timeoutMs? }`。
- `class PythonRunnerError extends Error`：`constructor(message, errorCode: number | null = null, stderr = '')`，`name = 'PythonRunnerError'`。由 `PythonRunnerService.run` 抛出；`ScraperController.search` 用 `instanceof` 和 `errorCode === 457` 判断"无结果"。

### `scraper/python/python-runner.service.ts`

启动 `scrape_cli.py` 子进程并解析结果。单测：有（`python-runner.service.spec.ts`，用 `__fixtures__/fake-cli.cjs`）。

构造依赖：`ConfigService`、`CloudflareService`。

#### `run<T>(options: PythonRunOptions): Promise<T>`

- **作用**：启动一次 Python，成功时解析出 `data` 返回；任何失败都以 `PythonRunnerError` 拒绝。
- **调用方**：`DGmangaSource.search/getMetadata/getChapters/getChapterImages`。
- **实现说明**：
  - **参数**：`argv = [cliScript, '--source', source, command, '--', ...args]`，可执行文件为 `python.executable`，`cwd` 为 `python.workingDir`。`--` 的理由（注释）：让 argparse 把后面的内容一律当位置参数，以 `-` 开头的 id（如 `-LoL2tSY`）才不会被当成选项。`--` 放在子命令之后，由子命令的解析器处理。
  - **环境**：继承 `process.env`，并设 `PYTHONIOENCODING=utf-8`；`windowsHide: true`。
  - **为什么用 `spawn` 而不是 `exec`**（注释）：旧 Python 代码会往 stderr 打大量调试输出，`spawn` 不会撑爆缓冲区，并且可以通过 stdin 传入数据。
  - **stdin**：注册完各监听器后，写入一行 JSON `{ active, cfClearance, userAgent }`（来自 `CloudflareService.getState()`），然后关闭 stdin。Python 侧据此重建旧的 `CF_dict`。没有给 `child.stdin` 挂 `error` 监听器；子进程在读 stdin 之前就退出时会发生什么，未确认。
  - **超时**：`options.timeoutMs ?? python.timeoutMs`（默认 180 000 ms）。到时设 `timedOut = true` 并 `child.kill('SIGTERM')`；在 `close` 事件里以 `Python CLI timed out after …ms` 拒绝。没有升级到 `SIGKILL`：如果子进程不响应 `SIGTERM`，`close` 不会触发，Promise 会一直挂着（未在代码中处理）。
  - **结果解析**（`close` 事件）：
    1. 超时 → 拒绝（见上）。
    2. stderr 非空 → 以 `verbose` 级别记录。
    3. 取 stdout 去首尾空白后的最后一行；为空 → `Python CLI produced no result line (exit=<code>)`。前面的行一律忽略（单测里的 `echo` 命令专门验证这一点）。
    4. 最后一行不是 JSON → `Could not parse Python CLI result: …\nLine: …`。
    5. `ok` 为假 → `PythonRunnerError(error ?? 'Python CLI reported failure', errorCode ?? null, stderr)`。
    6. 否则 `resolve(data)`。退出码只用于日志，不参与判断。
  - **`error` 事件**（例如可执行文件不存在）→ `Failed to spawn python: …`。
  - `settle()` 保证只结算一次，并清除定时器。
  - 错误消息里可能有 stdout 内容和路径，所以不直接返回给客户端：控制器经 `toScraperFailure` 只回固定消息（见 `scrape-errors.ts`）。

### `scraper/python/__fixtures__/fake-cli.cjs`

测试用的假抓取器，用 `node` 充当 "python" 运行。按 `argv` 取 `source`、`command`（跳过 `--source` 和 `--`），读完 stdin 后按命令输出：`echo`（回显参数和 stdin，先往 stdout 打一行杂项，验证只取最后一行）、`fail`（`ok:false, errorCode:457`）、`silent`（不输出直接退出）、`garbage`（非 JSON）、`hang`（不退出，测超时）；e2e 用的 `search`（`q` 为 `nothing` 时返回 457，否则两个候选 `-e2e1`/`E2E Manga`、`-e2e2`/`E2E Manga!`）、`metadata`（`chapterCount: 1, serialization: 1`）、`chapters`（空列表）。调用方：`python-runner.service.spec.ts`、`test/api-contract.e2e-spec.ts`。

### `scraper/sources/dgmanga.source.ts`

DogeManga 源。单测：无（经 `python-runner.service.spec.ts`、e2e 间接覆盖）。

构造依赖：`PythonRunnerService`。常量：`name = 'dgmanga'`、`displayName = 'DogeManga'`。

| 方法 | 作用 | 调用方 |
|---|---|---|
| `search(query)` | `run({ command: 'search', args: [query] })`，给每项加 `source: 'dgmanga'` | `ScraperService.search` |
| `getMetadata(mangaId)` | `run({ command: 'metadata', args: [mangaId] })`，取出 `chapterCount`、`serialization`、`errorCode` | `ScraperService.getMetadata` |
| `getChapters(mangaId)` | `run({ command: 'chapters', args: [mangaId] })`，取出 `chapters`、`errorCode` | `ScraperService.getChapters` |
| `getChapterImages(chapterUrl)` | `run({ command: 'chapter-images', args: [chapterUrl] })`，取出 `chapterTitle`、`imageUrls`、`requestHeaders`、`errorCode`；丢弃 Python 返回的 `imagePages` | `ScraperService.getChapterImages` |

文件内的 `DgmangaMetadataPayload`、`DgmangaChaptersPayload`、`DgmangaChapterImagesPayload` 是 Python 输出的形状。

### `scraper/sources/source-registry.service.ts`

单测：无。

构造依赖：`@Inject(MANGA_SOURCE_TOKEN) sources: IMangaSource[]`。

| 方法 | 作用 | 调用方 |
|---|---|---|
| `onModuleInit()` | 逐个放进 `byName`；同名抛 `Duplicate manga source registered: …`；每个写一行日志 | 由 Nest 在启动时调用 |
| `get(name)` | 返回源；未登记抛 `UnknownSourceException`（404 `unknown-source`） | `ScraperService` 的五个方法中除 `listSources` 外的四个 |
| `list()` | 已登记的名字 | `get`（错误消息） |
| `describe()` | `[{ name, displayName }]` | `ScraperService.listSources` |

### `scraper/scraper.service.ts`

所有抓取的唯一入口；下载、定时任务、漫画库都不直接引用具体的源。单测：有（`scraper.service.spec.ts`）。

构造依赖：`SourceRegistryService`、`SearchCacheService`。

#### `isSafeMangaId(id: unknown): id is string`（导出函数）

- **作用**：是非空字符串、不含 `/`、`\` 和控制字符（`\x00-\x1f`）、且不是 `.` 或 `..` 时为真。
- **调用方**：`ScraperService.search`。

#### `listSources()`

- **作用**：`registry.describe()`。
- **调用方**：`ScraperController.listSources`。

#### `search(sourceName, query): Promise<SearchResultDto[]>`

- **作用**：`registry.get(sourceName).search(query)` → 丢弃 `manga_id` 不安全的候选（每个写一条告警）→ `searchCache.putMany(results)` → 返回。
- **调用方**：`ScraperController.search`。
- **实现说明**：注释的理由：候选的 id 之后会成为下载目录名（`<名字>$<id>`，删除时整个 `rm -rf`）和封面文件名（`<id>.jpg`）；过滤掉能当路径用的 id，坏掉或恶意的源就逃不出数据目录。已在库里的旧记录不受影响。因为只有这里往搜索缓存里放东西，`ThumbnailService.save`（不做路径检查）拿到的 id 都已经过这道过滤。

#### `getMetadata`、`getChapters`、`getChapterImages`

- **作用**：按名字取源后直接转发。
- **调用方**：
  - `getMetadata` ← `ScraperController.metadata`、`DownloadOrchestratorService.runFullManga`、`SchedulerService.bootScan`。
  - `getChapters` ← `ScraperController.chapters`、`DownloadController.chapters`、`DownloadOrchestratorService.runFullManga`。
  - `getChapterImages` ← `ScraperController.chapterImages`、`DownloadOrchestratorService.scrapeChapterImages`。

### `scraper/scrape-errors.ts`

把抓取结果里的哨兵错误码和子进程失败映射成接口错误。只有控制器用；下载编排器自己处理错误码。单测：有（`scrape-errors.spec.ts`）。

抓取失败有两条通道：

1. Python 处理函数返回一个整数（目前只有搜索失败时的 457）→ `scrape_cli.py` 输出 `{ ok: false, errorCode: <int> }` → `PythonRunnerError`。
2. Python 正常返回、但 `data` 里带 `errorCode`（501、503、429）→ `run` 成功，结果对象上带 `errorCode`。

#### `scrapeFailure(errorCode): ApiException | null`

第 2 条通道的映射表：

| `errorCode` | HTTP | `error` | `message` |
|---|---|---|---|
| `undefined` / `null` | — | 返回 `null`（结果可用） | — |
| `501` | 502 | `scraper-blocked` | `Source is behind a Cloudflare challenge` |
| `504` | 451 | `dmca` | `Removed at the source (DMCA)` |
| `429` | 429 | `rate-limited` | `Source rate limited the request` |
| 其他（如 `503`） | 502 | `scraper-failed` | `Source returned status <code>` |

- **调用方**：`assertScrapeOk`。

#### `assertScrapeOk<T>(result: T): T`

- **作用**：`scrapeFailure(result.errorCode)` 非空就抛，否则原样返回。
- **调用方**：`DownloadController.chapters`、`ScraperController.metadata/chapters/chapterImages`。

#### `callScraper<T>(fn): Promise<T>`

- **作用**：执行 `fn`，抛错时改抛 `toScraperFailure(err)`。
- **调用方**：同 `assertScrapeOk` 的四处。

#### `toScraperFailure(err): HttpException`

- **作用**：`HttpException`（如 `unknown-source`）原样返回；其他（子进程失败、超时、输出无法解析）写一条 `ScraperFailure` 告警日志，返回 `ApiException(502, 'scraper-failed', { message: 'The scraper failed' })`。
- **调用方**：`callScraper`、`ScraperController.search`。
- **实现说明**：注释：`PythonRunnerError` 的消息里有 Python 的输出、解析错误和路径，只写日志，客户端只拿到固定消息。

### `scraper/scraper.controller.ts`

`@ApiTags('scraper')`、`@Controller('scraper')`。单测：有（`scraper.controller.spec.ts`）。

构造依赖：`ScraperService`、`SearchCacheService`。常量 `NO_RESULTS = 457`（`scrape_cli.py` 用这个状态表示"没有结果"）。

| 方法 | 路由 | 作用 |
|---|---|---|
| `listSources()` | `GET /api/scraper/sources` | `ok(scraper.listSources())` |
| `search(source, q)` | `GET /api/scraper/:source/search?q=` | `q` 去空白后为空 → `400 query-required`（`q must not be empty`）。调用 `scraper.search`；抛出 `PythonRunnerError` 且 `errorCode === 457` → `ok([])`；其他错误 → `toScraperFailure`。成功时每项补 `source`，`thumbnail` 改成 `/api/scraper/<source>/search-thumbnail/<manga_id>`（两段都 `encodeURIComponent`），base64 封面留在缓存里 |
| `searchThumbnail(source, mangaId, res)` | `GET /api/scraper/:source/search-thumbnail/:mangaId` | 缓存未命中 → 直接写 `404 { code: 404, error: 'thumbnail-not-found' }`；命中 → `image/jpeg`，内容为 base64 解码后的字节 |
| `metadata(source, mangaId)` | `GET /api/scraper/:source/manga/:mangaId/metadata` | `assertScrapeOk(await callScraper(...getMetadata))`，返回 `{ chapterCount, serialization }` |
| `chapters(source, mangaId)` | `GET /api/scraper/:source/manga/:mangaId/chapters` | 同上，返回 `list.chapters` |
| `chapterImages(source, url)` | `GET /api/scraper/:source/chapter-images?url=` | 同上，返回 `{ chapterTitle, imageUrls, requestHeaders }` |

调用方：全部为 HTTP 路由。

实现说明：

- `search` 改写 `thumbnail` 时用对象展开生成新对象，缓存里的对象不受影响。
- `chapterImages` 不校验 `url` 是否存在；缺省时把 `undefined` 传进 `argv`，最终结果未确认（推测 `spawn` 因参数类型不对而拒绝，经 `callScraper` 变成 502 `scraper-failed`）。
- 未登记的 `:source`：`registry.get` 抛 `UnknownSourceException`，经 `toScraperFailure` 原样传出 → 404 `unknown-source`。`searchThumbnail` 不查注册表，未登记的源直接 404 `thumbnail-not-found`。

### `search-cache/search-cache.module.ts`

全局模块，抓取（写）和漫画库（读）都注入它，彼此不用互相导入。单测：无。

### `search-cache/search-cache.service.ts`

内存里的搜索候选缓存。单测：有（`search-cache.service.spec.ts`）。

构造依赖：`ConfigService`（`searchCache.ttlMs`、`searchCache.maxEntries`）。状态：`store: Map<string, { value, expiresAt }>`。

| 方法 | 作用 | 调用方 |
|---|---|---|
| `key(source, mangaId)`（私有） | `${source}:${mangaId}` | `put`、`get` |
| `put(candidate)` | 键用 `candidate.source ?? 'dgmanga'`；先 `delete` 再 `set`，过期时间 `Date.now() + ttlMs`；然后 `evict()` | `putMany` |
| `putMany(candidates)` | 逐个 `put` | `ScraperService.search` |
| `get(source, mangaId)` | 没有 → `null`；`Date.now() > expiresAt` → 删除并返回 `null`；否则返回值（不刷新过期时间） | `LibraryService.addManga`、`ScraperController.searchThumbnail` |
| `evict()`（私有） | `store.size > maxEntries` 时反复删除第一个键 | `put` |

实现说明：

- **目的**（注释）：前端添加漫画时只提交 `{ source, manga_id, submit_sign }`，不用把 base64 封面再传回服务端；服务端从这里取回完整候选。
- **TTL**：只在 `get` 时检查。过期但没被读取的条目一直占位，直到被 FIFO 挤掉。
- **FIFO**：`Map` 保持插入顺序。`put` 先删后插，同一候选被再次搜到时移到末尾，最后才被淘汰。超出上限时淘汰最早插入的。
- 缓存只在内存，进程重启后清空，此时添加回 410 `search-expired`。

---

## 6. 下载 `modules/download/`

### `download/download.module.ts`

全局模块，见 0.1。单测：无。

### `download/queue/task.types.ts`

单测：无。

| 导出 | 内容 |
|---|---|
| `enum TaskKind` | `FULL_MANGA = 'full-manga'`、`REDOWNLOAD = 'redownload'`、`REZIP = 'rezip'` |
| `type TaskStatus` | `'pending' \| 'running' \| 'done' \| 'failed'` |
| `FullMangaPayload` | `{ kind: FULL_MANGA; mangaId }` |
| `RedownloadPayload` | `{ kind: REDOWNLOAD; mangaId; chapters: { index; title; url }[] }` |
| `RezipPayload` | `{ kind: REZIP }` |
| `TaskPayload` | 三者的联合 |
| `TaskHandle` | `{ id; payload; status; enqueuedAt; startedAt?; finishedAt?; error? }`，时间为毫秒 |
| `QueueSnapshot` | `{ active: TaskSummaryDto \| null; pending: TaskSummaryDto[] }` |
| `TaskSummaryDto` | `{ id; kind; mangaId?; status: 'pending' \| 'running'; enqueuedAt; startedAt? }` |

快照里只会有排队和运行中的任务，所以 `TaskSummaryDto` 没有完成状态和 `finishedAt`。

### `download/dto/submit-download.dto.ts`

单测：无。

| 类 | 字段与校验 | 用于 |
|---|---|---|
| `SubmitFullDownloadDto` | `manga_id`：`@IsString() @IsNotEmpty()` | `DownloadController.submit` |
| `ChapterPickDto` | `index`：`@IsInt()`；`title`：`@IsString()`；`url`：`@IsString()` | `SubmitRedownloadDto.chapters` 的元素；`DownloadService.submitRedownload` 的参数类型 |
| `SubmitRedownloadDto` | `manga_id`：同上；`chapters`：`@IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ChapterPickDto)` | `DownloadController.redownload` |

### `download/queue/task-queue.service.ts`

先进先出、同一时间只执行一个任务的队列，状态持久化到 `queue.json`。单测：有（`task-queue.service.spec.ts`）。

构造依赖：`ConfigService`（`storage.queueFile`）、`EventEmitter2`。

状态：`pending: TaskHandle[]`、`active: TaskHandle | null`、`executor: TaskExecutor | null`、`writeChain: Promise<void>`。

文件内类型：`type TaskExecutor = (payload) => Promise<void>`（导出）；`interface PersistedQueue { version: 1; tasks: { id; payload; enqueuedAt }[] }`（`tasks` 中运行中的任务在最前，其余按执行顺序）。

类注释：对应旧版 gevent 的 `utils/TaskQueue.py`，一次处理一部漫画。重启后被打断的运行中任务回到队首。重新执行 full-manga 任务是安全的，因为它从 `last_epi + 1` 开始，打断前已记录的章节不会再下。

#### `onModuleInit(): void`

- **作用**：`readPersisted()` 同步读出恢复的任务；为空则返回；否则 `pending.unshift(...restored)`（放在初始化期间可能已入队的任务前面），写日志，`void this.drain()`（启动时执行器尚未登记，所以直接返回）。
- **调用方**：由 Nest 在启动时调用（`DownloadModule` 是全局模块，早于 `LibraryModule`，见 0.5）。
- **实现说明**：同步恢复的理由（注释）：在任何东西（启动扫描、添加请求）能入队之前，队列已经完整，入队去重才能和恢复的任务比对。这里不调用 `changed()`，恢复本身不写盘也不广播；执行器在 `onApplicationBootstrap` 登记后 `drain()` 开始任务时才写盘并广播。

#### `registerExecutor(executor): void`

- **作用**：登记执行器；已登记过则抛 `TaskQueueService executor already registered`；然后 `void this.drain()`。
- **调用方**：`DownloadOrchestratorService.onApplicationBootstrap`。
- **实现说明**：注释：用回调登记，队列不持有编排器的引用，避免循环依赖注入（编排器依赖队列）。

#### `enqueue(payload): TaskHandle`

- **作用**：入队或返回重复的已有任务。
  - 找到重复（`findDuplicate`）：如果是 redownload，把新章节并入已有任务（`mergeChapters`）并调用 `changed()`；写日志 `De-duplicated …`；返回已有任务。
  - 否则新建 `{ id: randomUUID(), payload, status: 'pending', enqueuedAt: Date.now() }`，追加到 `pending` 末尾，写日志，`changed()`，`void this.drain()`，返回新任务。
- **调用方**：`DownloadService.submitFullManga`、`submitRedownload`、`submitRezip`。
- **实现说明**：去重规则见 `findDuplicate`。redownload 合并时即使没有新增章节也会 `changed()`，所以会有一次内容相同的 `queue_updated`（契约第 4 节已写明）。同步返回，调用方立即拿到任务 id。

#### `isMangaBusy(mangaId): boolean`

- **作用**：运行中任务或任一排队任务属于该漫画时为真（rezip 不属于任何漫画）。
- **调用方**：`LibraryController.delete`。

#### `activeMangaId(): string | null`

- **作用**：运行中任务的漫画 id；无运行任务或运行的是 rezip 时为 `null`。
- **调用方**：`isMangaBusy`。

#### `pendingSummaries()`、`activeSummary()`、`snapshot()`

- **作用**：用 `summarise` 转成对外摘要；`snapshot()` 返回 `{ active, pending }`。
- **调用方**：`pendingSummaries` ← `snapshot`；`activeSummary` ← `snapshot`、`DownloadService.current`；`snapshot` ← `changed`、`DownloadService.snapshot`。

#### `flushPersistence(): Promise<void>`

- **作用**：返回 `writeChain`，在所有已安排的写入落盘后完成。
- **调用方**：生产代码无调用方（单测用来等待写盘）。

#### `drain(): Promise<void>`（私有）

- **作用**：执行下一个任务。
  1. 有运行中任务或没有执行器 → 返回。
  2. 从 `pending` 头部取一个；没有 → 返回。
  3. 设为 `active`，`status = 'running'`，`startedAt = Date.now()`，日志，`changed()`。
  4. `await executor(payload)`：正常 → `status = 'done'`；抛错 → `status = 'failed'`，`error = message`，错误日志（带堆栈）。
  5. `finally`：`finishedAt = Date.now()`，`active = null`，`changed()`，`setImmediate(() => void this.drain())`。
- **调用方**：`onModuleInit`、`registerExecutor`、`enqueue`、自身（`setImmediate`）。
- **实现说明**：
  - 并发为 1：`active` 在第一个 `await` 之前同步设置，之后任何 `drain()` 调用都会在第 1 步返回。Node 单线程，不需要锁。
  - 下一个任务在新的事件循环轮次启动，注释的理由：让 `enqueue()` 的调用方先拿到返回值。
  - 任务失败不重试，也不放回队列；失败只体现在日志里，完成的任务不再出现在快照中。
  - 执行器拒绝不会让队列停下。

#### `findDuplicate(payload): TaskHandle | undefined`（私有）

- **作用**与去重规则：
  - redownload：只在 `pending` 里找同一漫画的 redownload。注释：运行中的 redownload 章节列表已经固定，所以新请求要新排一个。
  - full-manga、rezip：先看运行中任务，再看 `pending`。
- **调用方**：`enqueue`。
- **实现说明**：full-manga 与运行中的同漫画 full-manga 去重，意味着任务运行期间源站新增的章节，要等下次扫描才会被下载。

#### `sameTask(a, b): boolean`（私有）

- **作用**：`kind` 相同且漫画 id 相同（rezip 的漫画 id 都是 `null`，所以所有 rezip 互相匹配）。
- **调用方**：`findDuplicate`、`readPersisted`。

#### `mergeChapters(target, extra): void`（私有）

- **作用**：把 `extra.chapters` 中 `url` 不在 `target.chapters` 里的章节追加到 `target.chapters` 末尾（就地修改）。
- **调用方**：`enqueue`、`readPersisted`。
- **实现说明**：按 `url` 去重，不看 `index` 或 `title`。合并后章节顺序是"先来的在前"，不重新排序。

#### `changed(): void`（私有）

- **作用**：`persist()`，然后 `events.emit(QUEUE_CHANGED, this.snapshot())`。
- **调用方**：`enqueue`（新任务、redownload 合并）、`drain`（开始、结束）。

#### `persist(): void`（私有）

- **作用**：`writeChain = writeChain.then(() => writeAtomic()).catch(err => 错误日志 'Could not write …')`。
- **调用方**：`changed`。
- **实现说明**：所有写入串在一条链上，不会两个写入同时进行；写失败只记日志，链继续，后面的写入照常执行。

#### `writeAtomic(): Promise<void>`（私有）

- **作用**：在它真正执行的那一刻读取队列状态（运行中任务在前，然后是 `pending`），只保留 `id`、`payload`、`enqueuedAt`，生成 `{ version: 1, tasks }`；建父目录；写 `<queueFile>.tmp`（2 空格缩进）；`rename` 到正式文件。
- **调用方**：`persist`。
- **实现说明**：注释：每次写入捕捉的是执行时的状态，不是安排时的状态，所以最后一次写入一定反映最新状态（中间几次可能写出相同内容）。状态（`running`、`failed` 等）不落盘：恢复时全部视为 `pending`。不 `fsync`。

#### `readPersisted(): TaskHandle[]`（私有）

- **作用**：同步读取并校验 `queue.json`。

| 情况 | 处理 |
|---|---|
| 文件不存在（`ENOENT`） | 同步建父目录，返回 `[]` |
| 读不了（其他错误，如容器换 uid 后的 `EACCES`） | `keepAside('cannot be read (…)')`，返回 `[]` |
| 不是合法 JSON（包括断电后的零长度文件） | `keepAside('is not valid JSON (…)')`，返回 `[]` |
| 是 JSON 但不是对象、是数组、`version !== 1` 或 `tasks` 不是数组 | `keepAside('is not a version-1 queue file')`，返回 `[]` |
| 某个条目不合法（`isValidEntry` 为假） | 告警 `Skipping malformed queue entry`，跳过 |
| 条目 `id` 与已收的重复 | 告警 `Dropping duplicate queue entry (same id)`，跳过 |
| 条目与已收的某个任务是同一任务（`sameTask`） | redownload 则把章节并入先收的那个；告警 `Dropping duplicate queue entry`，跳过 |
| 其他 | 收入，`status: 'pending'`，保留原 `id` 与 `enqueuedAt` |

- **调用方**：`onModuleInit`。
- **实现说明**：与漫画库不同，队列文件坏了不阻止启动。注释的理由：丢掉队列只丢掉下一次启动扫描会重新排入的工作（full-manga 任务）；重下任务可以从留存的文件里找回再提交。坏文件改名留存，而不是删掉或覆盖，是为了留作证据，且下一次写入不会覆盖它。恢复时的去重规则与 `enqueue` 一致；因为恢复的任务全是 `pending`，redownload 也会被合并（`enqueue` 时运行中的 redownload 不参与合并，这里没有运行中的概念）。

#### `keepAside(reason): void`（私有）

- **作用**：把 `queue.json` 改名为 `queue.json.corrupt-<unix 秒>`，告警说明原因和新文件名；改名失败则写错误日志。两种情况都以空队列继续。
- **调用方**：`readPersisted`。

#### `isValidEntry(e)`、`isValidPayload(p)`、`isValidChapter(c)`（私有）

- **作用**：
  - 条目：对象；`id` 为非空字符串；`enqueuedAt` 为有限数字；`payload` 合法。
  - 载荷：`rezip` 总是合法；`full-manga` 需要非空字符串 `mangaId`；`redownload` 还需要非空的 `chapters` 数组且每项合法；未知 `kind` 不合法。
  - 章节：对象；`index` 为整数；`title`、`url` 为字符串。
- **调用方**：`readPersisted`（经 `isValidEntry` 逐层调用）。

#### `payloadMangaId(payload)`、`describe(t)`、`summarise(t)`（私有）

- **作用**：
  - `payloadMangaId`：rezip 为 `null`，否则 `mangaId`。
  - `describe`：日志用的 `task[<kind>, <id>]` 或 `task[<kind>]`。
  - `summarise`：转成 `TaskSummaryDto`；`status` 为 `running` 时输出 `running`，其他一律 `pending`；`mangaId` 为 `null` 时省略。
- **调用方**：本类内部多处。

### `download/download.service.ts`

控制器和定时任务使用的门面；注释要求控制器不要直接碰编排器。单测：无（`download.controller.spec.ts` 覆盖其部分行为，未逐项确认）。

构造依赖：`TaskQueueService`、`LibraryService`。

#### `handleMangaAdded(event: MangaAddedEvent): void` — `@OnEvent(MANGA_ADDED)`

- **作用**：写日志，`submitFullManga(event.mangaId)`。
- **调用方**：事件 `manga.added` 触发（发出方 `LibraryController.add`）。
- **实现说明**：若 `submitFullManga` 抛错（理论上不会，刚加入的漫画一定存在），被 event-emitter 吞掉并记日志。

#### `submitFullManga(mangaId): TaskHandle`

- **作用**：`library.has(id)` 为假（不存在或删除中）→ 抛 `MangaNotFoundException`；否则 `queue.enqueue({ kind: FULL_MANGA, mangaId })`。
- **调用方**：`DownloadController.submit`、`DownloadService.handleMangaAdded`、`SchedulerService.submit`。

#### `submitRedownload(mangaId, chapters): TaskHandle`

- **作用**：同样的存在检查，`enqueue({ kind: REDOWNLOAD, mangaId, chapters })`。
- **调用方**：`DownloadController.redownload`。

#### `submitRezip(): TaskHandle`

- **作用**：`enqueue({ kind: REZIP })`。
- **调用方**：`DownloadController.rezip`。

#### `current()`、`snapshot()`

- **作用**：转发到 `queue.activeSummary()`、`queue.snapshot()`。
- **调用方**：`DownloadController.current`、`DownloadController.queue`。

### `download/download.controller.ts`

`@ApiTags('download')`、`@Controller()`（无前缀，路由自带 `download/` 或 `library/`）。单测：有（`download.controller.spec.ts`）。

构造依赖：`DownloadService`、`ScraperService`、`LibraryService`。

| 方法 | 路由 | 作用 | 守卫 |
|---|---|---|---|
| `submit(body: SubmitFullDownloadDto)` | `POST /api/download` | `ok({ taskId: download.submitFullManga(manga_id).id })`；不存在 → 404 `manga-not-found` | |
| `redownload(body: SubmitRedownloadDto)` | `POST /api/download/chapters` | `ok({ taskId: download.submitRedownload(manga_id, chapters).id })` | |
| `rezip()` | `POST /api/library/rezip` | `ok({ taskId: download.submitRezip().id })` | `AdminTokenGuard` |
| `queue()` | `GET /api/download/queue` | `ok(download.snapshot())` | |
| `current()` | `GET /api/download/current` | `ok(download.current() ?? null)` | |
| `chapters(mangaId)` | `GET /api/library/:mangaId/chapters` | `library.get(id)`（不存在 → 404）→ `callScraper(() => scraper.getChapters(manga.source ?? 'dgmanga', id))` → `assertScrapeOk` → `ok(list.chapters)` | |

调用方：全部为 HTTP 路由。`rezip` 和 `chapters` 另带 `@ApiTags('library')`，在 Swagger 里归在 library 下。

### `download/download-orchestrator.service.ts`

单个任务的完整流程：元数据 → 章节列表 → 图片 → 打包 → 更新记录 → 事件 → Kavita 扫描。对应 `main.py` 的 `confirm_comic_task`（full-manga）、`download_chapter_task`（redownload）、`re_zip_task`（rezip）。单测：有（`download-orchestrator.service.spec.ts`）。

构造依赖：`TaskQueueService`、`ScraperService`、`ImageDownloaderService`、`FilesystemService`、`ArchiveService`、`LibraryService`、`EventEmitter2`、`EventsGateway`、`ConfigService`。

常量与字段：

| 名称 | 值 | 含义 |
|---|---|---|
| `chapterConcurrency` | `concurrency.workers`（`NUMBER_OF_WORKERS`，默认 2） | 同时处理的章节数 |
| `maxFailedImagesPerChapter` | `10` | 一章失败图片数达到此值则整章放弃（与 `DGmanga.py:download_img` 相同） |
| `maxChapterRateLimitRetries` | `5` | 章节页 429 的重试次数（对应 `main.py` 的 `g_error_count` 上限） |
| `chapterRateLimitBaseMs` | `40_000` | 章节页 429 等待的基数（对应 `g_wait_time=40s`） |

#### `onApplicationBootstrap(): void`

- **作用**：`queue.registerExecutor((payload) => this.dispatch(payload))`。
- **调用方**：由 Nest 在所有模块的 `onModuleInit` 都结束之后调用。
- **实现说明**：队列在登记执行器之前不会执行任何任务，所以在这里登记保证了任务（尤其是从 `queue.json` 恢复的）不会在 `LibraryRepository` 读完库文件之前开始。不能用 `onModuleInit`：`DownloadModule` 是全局模块，它的 `onModuleInit` 早于 `LibraryModule` 的（见 0.5）。恢复的任务若对应的漫画已不在库里，`library.get` 抛 `Unknown manga`，该任务记为失败，队列继续下一个。

#### `dispatch(payload): Promise<void>`（私有）

- **作用**：按 `kind` 分派到 `runFullManga`、`runRedownload`、`runRezip`。
- **调用方**：`TaskQueueService.drain`（经登记的执行器）。

#### `runFullManga(payload): Promise<void>`（私有）

- **作用**：整部下载（从上次进度续下）。流程：

1. `manga = library.get(mangaId)`（不存在 → 抛 404 异常，队列记为失败，不发 Socket 事件）。`sourceName = manga.source ?? 'dgmanga'`。
2. `meta = scraper.getMetadata(...)`。抛错（子进程失败）→ 直接冒出，任务失败，不发 Socket 事件。
3. `handleSentinel(meta)`：`504` → `handleDmca` 后返回；`501` → 告警后返回。两种情况都不发 `download_started`/`download_completed`。其他 `errorCode`（如 503）不在这里处理，流程继续。
4. `manga.last_epi > meta.chapterCount` → 日志"nothing to download"，返回（不发事件，不改记录，不触发 Kavita）。
5. `announceStart(id, 'full-manga')`（Socket `download_started`）。
6. `try` 块内：
   - `list = scraper.getChapters(...)`；`handleChapterListSentinel(list)` 为真（504 或 501）→ `announceEnd(..., 'failed', 0, 0)` 后返回。
   - `start = manga.last_epi <= 1 ? 1 : manga.last_epi + 1`；`wanted = list.chapters.filter(c => c.index >= start)`；`total = wanted.length`。
   - `wanted` 为空 → 只写日志；否则 `failedCount = processChapters(manga, sourceName, wanted)`。
   - `catch`：`announceEnd(..., 'failed', total, failedCount)` 后重新抛出（任务记为失败）。
7. `total > 0 && failedCount === total`（全部失败）→ 错误日志、`announceEnd(..., 'failed', ...)`，返回。不改记录，不发 `download.completed`。
8. 写记录 `library.patch`：
   - 总是：`completed: true`、`serialization: meta.serialization`。
   - 至少一章成功（`total > 0 && failedCount < total`）时：`updated_at: nowSeconds()`。
   - 本次开始前 `completed` 为假（首次完成）时：`download_switch: meta.serialization`。
9. `announceEnd(..., 'done', total, failedCount)`，日志，`eventEmitter.emit(DOWNLOAD_COMPLETED, { mangaId, mangaName })`。

- **调用方**：`dispatch`。
- **实现说明**：
  - **续下**：注释：任务重跑（例如重启后恢复）时，到 `last_epi` 为止的章节已记录，被跳过。`last_epi` 在每章成功后就写盘（见 `processOneChapter`），所以中途中断最多重下正在处理的那几章。
  - **`last_epi <= 1` 从第 1 话开始**：新记录的 `last_epi` 是 1（旧格式），无法区分"从未下载"和"已下第 1 话"，所以一律从第 1 话开始。代价是 `last_epi` 为 1 的漫画再跑一次 full-manga 时会重下第 1 话。
  - **第 4 步用 `>`**：`last_epi === chapterCount` 时不提前返回，而是走完整流程：`wanted` 为空、`total = 0`，记录被标记完成（不改 `updated_at`），发 `download_started` 与 `download_completed`（`chapters_total: 0`），并触发 Kavita 扫描。`SchedulerService.bootScan` 只在 `last_epi < chapterCount` 时排入任务，所以这条路径主要来自手动 `POST /api/download`、新漫画（`last_epi = 1` 且只有 1 话时走正常下载）或恢复的任务。
  - **全部失败不改记录**：注释的理由：什么都没下来（源站拦截、页面结构变了……）时保持记录原样，下次扫描会重试。若标记为完成，还会把 `serialization` 写进 `download_switch`，已完结的连载从此不会再被扫描。
  - **`download_switch` 只在首次完成时设置**：已完结（`serialization = 1`）的漫画首次下完后自动更新被关闭，启动扫描从此跳过它；之后用户手动打开的开关不会被后续下载覆盖。
  - **`updated_at`**：注释：它决定"最近更新"排序，只有真正下了东西的运行才能推进它，已是最新的空跑不能改。

#### `runRedownload(payload): Promise<void>`（私有）

- **作用**：重下用户选中的章节。
  1. `library.get`（不存在 → 抛错，无 Socket 事件）。
  2. `announceStart(id, 'redownload')`。
  3. `try`：`failedCount = processChapters(..., payload.chapters, { updateLastEpi: false })`；至少一章成功时 `library.patch({ updated_at })`。`catch`：`announceEnd(..., 'failed', total, total)` 后重新抛出。
  4. `announceEnd`：全部失败为 `failed`，否则 `done`。
  5. 发 `DOWNLOAD_COMPLETED`（注释：`main.py:download_chapter_task` 也触发了 Kavita 扫描）。
- **调用方**：`dispatch`。
- **实现说明**：与 full-manga 的区别：不查元数据，不处理哨兵错误码（章节页的 429 仍在 `scrapeChapterImages` 里重试），不改 `last_epi`、`completed`、`serialization`、`download_switch`；全部失败时也发 `download.completed`。重下的章节目录名与原压缩包相同，`ArchiveService.zipDir` 用 `createWriteStream` 写 `<目录>.zip`，会覆盖旧压缩包。

#### `runRezip(_payload): Promise<void>`（私有）

- **作用**：`archive.rezipDownloadRoot()`，写一行汇总日志（扫描的漫画数、打包的章节数、跳过数、错误数），`events.emitScanCompleted()`。
- **调用方**：`dispatch`。
- **实现说明**：rezip 也走单并发队列，执行时不会有下载任务同时在写章节目录。

#### `processChapters(manga, sourceName, chapters, { updateLastEpi = true }): Promise<number>`（私有）

- **作用**：以有限并发处理一组章节，返回失败章节数。
  1. `library.has(id)` 为假 → 抛 `… was removed from the library; not downloading`。
  2. `fsService.ensureMangaTree(name, id)` 建出 `<root>/<名字>$<id>/<名字>/`。
  3. 发一次 `download_progress`（`chapters_done: 0`）。
  4. 循环：在途数小于 `chapterConcurrency` 且还有章节时，启动下一章（不是第一章时先等 `chapterStartDelayMs()`，即 2–5 秒）；每章 `processOneChapter(...)`：失败 → 记下标题并写错误日志；结束（无论成败）→ 从在途集合移除，`done += 1`，发 `download_progress`。没有空位时 `await Promise.race(inFlight)`。
  5. 有失败时写一条汇总告警。
- **调用方**：`runFullManga`、`runRedownload`。
- **实现说明**：
  - 第 1 步的理由（注释）：删除的忙碌检查发生在任务入队之前时，该漫画可能在任务抓取期间被删掉，不能把它的目录重新建成孤立目录。
  - 章节启动间隔：注释说与 Flask 一样间隔 2–5 秒，以避开源站限流。等待发生在填充循环里，此时在途的章节继续运行。
  - 单章失败不会让任务失败；只有第 1、2 步的异常会冒出去。
  - `chapters_done` 含失败章节，`chapters_failed` 是其中失败的数量。
  - 并发为 2 时章节可能乱序完成。`last_epi` 只会向前推进（见下），所以如果第 5 话先于第 4 话完成、而第 4 话随后失败，`last_epi` 仍是 5，第 4 话不会在以后的整部下载中被补上（`scrapeChapterImages` 的注释提到了"被丢弃的章节永远不会被重新拾起"，那是 429 重试存在的理由）。只能用重下补。

#### `processOneChapter(manga, sourceName, chapter, innerDir, updateLastEpi): Promise<void>`（私有）

- **作用**：下载并打包一章。
  1. `safeTitle = sanitiseTitle(reformatChapterTitle(chapter.title), chapter.index)`。
  2. `chapterDir = fsService.chapterDir(innerDir, safeTitle)`（不是 `innerDir` 的直接子目录则抛错）。
  3. `images = scrapeChapterImages(sourceName, chapter.url, safeTitle)`。
  4. 生成下载任务：文件名为三位序号 `001.jpg`、`002.jpg`……（`padPage`），每张都带 `images.requestHeaders`。
  5. `imageDownloader.downloadChapter(chapterDir, jobs, { label })`。
  6. 失败数 `>= 10` → `fsService.removeDir(chapterDir)`，抛 `<失败数>/<总数> images failed (first: …)`。失败数在 1–9 之间 → 告警（带第一个失败原因和地址），继续。
  7. `archive.zipChapter(chapterDir)`：打包为 `<章节名>.zip` 并删除目录。
  8. `updateLastEpi` 为真时重新读取记录，满足 `chapter.index > current.last_epi`，或 `!current.completed && chapter.index === current.last_epi` 时，`library.patch({ last_epi: index, last_epi_name: safeTitle, updated_at: nowSeconds() })`。
  9. 重新读取记录，经 `toApiManga` 后发 `chapter_completed`（`manga_id`、`chapter_index`、`chapter_title: safeTitle`、当前的 `last_epi`、`last_epi_name`、`updated_at`）。
- **调用方**：`processChapters`。
- **实现说明**：
  - 第 6 步删除半成品目录的理由（注释）：防止之后的 rezip 把它当成完整章节打包。
  - 失败数低于阈值时照常打包，与 `DGmanga.py:download_img` 重试一轮后的做法一致（注释）。
  - 第 8 步的第二个条件（注释）：从未下载的漫画 `last_epi` 从 1 开始（旧格式），所以在首次下载完成前，第 1 话也要能推进它（写入 `last_epi_name`）。
  - `imageUrls` 为空时（页面能解析但没有图片），下载器什么也不做、没有失败，空目录被打成空 zip，章节算成功并推进 `last_epi`。

#### `announceStart(mangaId, kind)`、`announceEnd(mangaId, kind, status, total, failed)`（私有）

- **作用**：
  - `announceStart`：`events.emitDownloadStarted({ manga_id, kind })`。
  - `announceEnd`：读取记录并 `toApiManga`；读取失败（已被删除，如 DMCA）时为 `null`；`events.emitDownloadCompleted({ manga_id, kind, status, chapters_total, chapters_failed, manga })`。
- **调用方**：`announceStart` ← `runFullManga`、`runRedownload`；`announceEnd` ← `runFullManga`（4 处）、`runRedownload`（2 处）。
- **实现说明**：注释：`announceEnd` 在每一条路径上结束 `announceStart` 开启的运行。`announceStart` 之前的提前返回（元数据哨兵、已是最新）两个事件都不发。

#### `nowSeconds()`、`chapterStartDelayMs()`、`padPage(n)`、`sleep(ms)`

- **作用**：`Math.floor(Date.now() / 1000)`；`2000 + Math.random() * 3000`；`n` 左补零到 3 位；`setTimeout` 包装。
- **调用方**：本类内部。`sleep` 是 `protected`，注释：测试里可以覆盖，免得退避真的等待。

#### `scrapeChapterImages(sourceName, chapterUrl, label)`（私有）

- **作用**：取一章的图片地址，遇 429 等待重试。无 `errorCode` → 返回；`errorCode` 不是 429，或已重试 `maxChapterRateLimitRetries` 次 → 抛 `chapter scrape returned errorCode=…`；否则等待 `40_000 × (attempt + 1) + random × 10_000` 毫秒后重试。
- **调用方**：`processOneChapter`。
- **实现说明**：等待时间依次约为 40、80、120、160、200 秒（各加 0–10 秒随机），最多 6 次请求。`getChapterImages` 本身抛错（子进程失败、超时）不重试，章节直接失败。注释的理由：旧抓取器遇到被限流的章节页会休眠后重试；不重试的话该章被丢弃，而 `last_epi` 只记录下载过的最大序号，被丢弃的章节永远不会被重新拾起。

#### `handleSentinel(meta, manga)`、`handleChapterListSentinel(list, manga)`（私有）

- **作用**：`errorCode === 504` → `handleDmca(manga)`，返回 `true`；`501` → 告警，返回 `true`；其他 → `false`。
- **调用方**：`runFullManga`（分别用于元数据和章节列表）。

#### `handleDmca(manga): Promise<void>`（私有）

- **作用**：告警；`library.deleteManga(id)`（抛错只记日志）；`events.emitDmcaAlert({ manga_id, manga_name })`。
- **调用方**：`handleSentinel`、`handleChapterListSentinel`。
- **实现说明**：`deleteManga` 返回 `false`（目录删不掉，记录保留）时，这里不检查返回值，照样发 `dmca_alert`。当前的 Python 抓取器从不输出 504（见 14.2），这条路径实际上走不到。

#### `sanitiseTitle(title, index): string`（私有）

- **作用**：把已改写的章节名变成可用的单个路径段。Linux 等平台只把 `/` 换成 `_`；Windows 把 `\ / : * ? " < > |` 都换成 `_`。然后 `trim()`。结果为空、`.` 或 `..` 时告警并返回 `第<index>话`；否则返回结果。
- **调用方**：`processOneChapter`。
- **实现说明**（注释）：旧应用原样使用标题，所以在部署平台 Linux 上只替换路径分隔符，保证与已有的压缩包同名；Windows 只用于开发，额外拒绝几个字符。空、`.`、`..` 会让章节目录变成漫画目录本身或其上级，失败章节的 `removeDir` 或打包步骤就会毁掉所有章节，所以回退成 `第N话`。`FilesystemService.chapterDir` 在后面再检查一次。

### `download/chapter-title.ts`

`utils/chapter_title_reformat.py` 的移植。单测：有（`chapter-title.spec.ts`，对照 `__fixtures__/chapter-title-reformat.json`，该文件由旧 Python 实现生成）。

理由（文件注释）：Flask 版在把章节名用作章节目录名、压缩包名和 `last_epi_name` 之前都会改写；Kavita 从这些名字里解析卷号和话数，所以新下载必须和旧下载同名。分支逐条对应 Python，包括它的怪癖（例如季数分支不把括号换成全角）。

#### 正则常量

`SEASON = /[sS][0-9]+/`、`CHAPTER_RANGE = /第[0-9]+-[0-9]+话/`、`VERSION = /[vV][0-9]+/`、`NUMBER = /[0-9]+/g`。

#### `widenParens(title)`、`splitAfterLetter(title, index)`（文件内函数）

- `widenParens`：把 `(`、`)` 换成全角 `（`、`）`。
- `splitAfterLetter`：在 `index` 位置的字母之后插入 `$`。
- 调用方：`reformatChapterTitle`。

#### `reformatChapterTitle(title): string`

- **作用**：按下表顺序匹配，命中第一条就返回。
- **调用方**：`DownloadOrchestratorService.processOneChapter`。

| 顺序 | 条件 | 改写 | 括号换全角 | 例子（取自对照样例） |
|---|---|---|---|---|
| 1 | 含 `s`/`S` 紧跟数字 | 每一处都在字母后插 `$`，循环到不再匹配为止 | 否 | `电锯人s1s0s10086` → `电锯人s$1s$0s$10086`；`-电(s11)锯s0人S2` → `-电(s$11)锯s$0人S$2`；`ss12` → `ss$12` |
| 2 | 含 `第<数字>-<数字>话` | 所有 `-` 换成 `-第` | 是 | `第68-69话` → `第68-第69话`；`第12-13话(修)` → `第12-第13话（修）`；`第1-2话 v3` → `第1-第2话 v3` |
| 3 | 含 `v`/`V` 紧跟数字 | 只在第一处的字母后插 `$` | 是 | `先西日记v2` → `先西日记v$2`；`第10话 v2` → `第10话 v$2`；`vv3` → `vv$3` |
| 4 | 有两个或更多数字串，且不含 `.` | 每个数字串前加 `第` | 否 | `2022-2023残夏问候` → `第2022-第2023残夏问候`；`12-13` → `第12-第13`；`1 2` → `第1 第2`；`第1話 第2話` → `第第1話 第第2話` |
| 5 | 其他 | 所有 `-` 换成 `$` | 是 | `特别篇-夏日` → `特别篇$夏日`；`第7话-后篇` → `第7话$后篇`；`番外(1)` → `番外（1）`；`a-b(c)` → `a$b（c）` |

不变的例子：`第48.5话`、`第5话`、`SP1`（`S` 后面是 `P`，不命中规则 1；只有一个数字串，落到规则 5，没有 `-` 和括号）、`Vol.3 第20话`（两个数字串但含 `.`，落到规则 5）、`电锯人第100话sAAA`、空串。

实现说明：规则 1 循环能结束，是因为插入 `$` 后该位置的字母后面不再紧跟数字。规则 1 用的 `SEASON` 不带 `g` 标志，每轮从头 `exec`。规则 4 的 `第第1話` 是对 Python 行为的忠实复制。

### `download/image-downloader.service.ts`

下载一章的全部图片。对应 `modules/DGmanga.py:download_img`；用普通 axios 而不是 DrissionPage，因为图片地址是直接的资源地址，没有 JS 验证（注释）。单测：无。

导出类型：`ImageDownloadJob { url; filename; extraHeaders? }`、`ChapterDownloadResult { succeeded: ImageDownloadJob[]; failed: { job; reason }[] }`。

构造依赖：`HttpService`（`DownloadModule` 的实例，30 秒超时）、`FilesystemService`、`CloudflareService`、`ConfigService`。

字段：

| 名称 | 值 | 含义 |
|---|---|---|
| `maxRetriesPerImage` | `3` | 每张图最多重试次数（最多 4 次请求） |
| `defaultUserAgent` | `DEFAULT_BROWSER_USER_AGENT` | 兜底 UA |
| `cooldownUntil` | 初始 `0` | 429 冷却截止时间（毫秒时间戳） |
| `defaultConcurrency` | `download.imageConcurrency`（默认 1） | 每章并发数 |
| `imageDelayMs` | `download.imageDelayMs`（默认 1000） | 礼貌延迟基数 |
| `progressIntervalMs` | `download.progressIntervalMs`（默认 10000） | 进度日志间隔 |

#### `downloadChapter(chapterDir, jobs, { concurrency?, label? } = {}): Promise<ChapterDownloadResult>`

- **作用**：建章节目录，以 `concurrency`（默认取配置）个工作协程下载全部图片，返回成功和失败列表。从不因单张失败而拒绝。
- **调用方**：`DownloadOrchestratorService.processOneChapter`（只传 `label`）。
- **实现说明**：
  - **工作池**：建 `concurrency` 个异步函数，共享一个 `cursor`；每个循环取 `cursor++` 对应的任务，调用 `downloadOne`，成功进 `succeeded`，抛错进 `failed`（原因为错误消息），`done += 1`。单线程下 `cursor++` 不会冲突。
  - **礼貌延迟**：每张之后，若还有未领取的任务，`politeDelay()`（`imageDelayMs + random × imageDelayMs`，默认 1–2 秒）；最后一张后不等。对应旧版的 `gevent.sleep(1 + rand)`。
  - **心跳日志**：`progressIntervalMs > 0` 且有任务时，`setInterval` 每隔该时长在 `done < total` 时写 `<label>: done/total images downloaded (N failed)`。短于一个间隔的章节不会打日志。`finally` 里清除定时器。
- **`succeeded`/`failed` 的顺序**是完成顺序，不是任务顺序。

#### `downloadOne(chapterDir, job): Promise<void>`（私有）

- **作用**：下载一张图并写盘，带重试。
- **调用方**：`downloadChapter`。
- **实现说明**：`attempt` 从 0 到 3 循环：
  1. `waitForCooldown()`。
  2. `fetch(job)`：
     - 状态 429 → `scheduleBackoff(attempt)`，`attempt += 1`，继续（不额外等待，下一轮由冷却控制）。
     - 状态 `>= 400` → 抛 `HTTP <status>`，进入 `catch`。
     - 否则 `fsService.writeImage(...)`，返回。
  3. `catch`：错误带 `response.status === 429` → 同上退避；否则 `attempt >= 3` 时抛出原错误，不然 `attempt += 1`，等 `500 × attempt` 毫秒再试。
  4. 循环因 429 用完 → 抛 `max retries exceeded for <url>`。

  因为 `fetch` 设了 `validateStatus: () => true`，axios 不会因状态码抛错，`catch` 里的 429 分支基本只是兜底。写盘失败也按普通错误重试。

#### `fetch(job): Promise<AxiosResponse>`（私有）

- **作用**：`GET job.url`，`responseType: 'arraybuffer'`，`validateStatus: () => true`，`timeout: 30_000`。请求头按优先级从低到高合并：`User-Agent: defaultUserAgent`、`Referer: https://dogemanga.com/` → `CloudflareService.buildHeaders()`（有 Cloudflare 状态时的 UA 与 `cf_clearance` cookie）→ `job.extraHeaders`（Python 返回的 `requestHeaders`）。
- **调用方**：`downloadOne`。
- **实现说明**：兜底 UA 的理由（注释）：Cloudflare 未激活时 `buildHeaders()` 和 Python 的 `requestHeaders` 都是空的，axios 会以 `axios/x.y` 出去并收到 403；真实的 Cloudflare UA（激活时）会覆盖它。

#### `scheduleBackoff(attempt): void`（私有）

- **作用**：`wait = (5 + attempt × 5 + random × 5) × 1000` 毫秒（约 5–10、10–15、15–20、20–25 秒）；`cooldownUntil = max(cooldownUntil, now + wait)`；告警。
- **调用方**：`downloadOne`。

#### `waitForCooldown(): Promise<void>`（私有）

- **作用**：当前时间早于 `cooldownUntil` 时循环休眠到截止时间（期间截止时间被推后则继续等）。
- **调用方**：`downloadOne`。
- **实现说明**：共享冷却：一张图遇到 429，所有其他并发请求在下一次请求前都会停下，直到冷却结束；`max` 保证冷却只会延长不会缩短。对应 `DGmanga.py` 里的 `Error_dict["g_error_flag"]`。字段注释说"同一章节内的并发下载"，但 `cooldownUntil` 是单例服务上的字段，所以实际作用范围是整个进程：`NUMBER_OF_WORKERS` 为 2 时同时下载的两章也共享同一个冷却。

#### `politeDelay()`、`sleep(ms)`（私有）

- **作用**：见上；`sleep` 对负数取 0。
- **调用方**：`downloadChapter`；`sleep` ← 本类多处。

---

## 7. 文件系统 `modules/filesystem/`

### `filesystem/filesystem.module.ts`

全局模块，见 0.1。单测：无。

### `filesystem/manga-path.ts`

磁盘上漫画目录的命名规则。下载、删除、Kavita 扫描都必须经过这里，三者才一致。单测：有（`manga-path.spec.ts`）。

布局：`{downloadRoot}/{名字}${id}/{名字}/{章节}.zip`。

#### `mangaDirName(mangaName): string`

- **作用**：把名字里的 `/` 换成 `-`（例如 `Fate / Strange Fake` → `Fate - Strange Fake`）。注释：否则会建出嵌套目录；旧抓取器也这么做。
- **调用方**：`mangaFolderName`、`FilesystemService.ensureMangaTree`（内层目录）。

#### `mangaFolderName(mangaName, mangaId): string`

- **作用**：`${mangaDirName(name)}$${id}`。
- **调用方**：`FilesystemService.ensureMangaTree`、`LibraryService.deleteManga`、`KavitaService.scanFolder`。

### `filesystem/filesystem.service.ts`

文件操作的薄封装。单测：有（`filesystem.service.spec.ts`）。

构造依赖：`ConfigService`（`storage.downloadRoot`）。

| 方法 | 作用 | 调用方 |
|---|---|---|
| `ensureDir(path)` | `mkdir -p` | `ensureMangaTree`、`writeImage`、`writeFile`、`writeJson`、`ImageDownloaderService.downloadChapter`、`ThumbnailService.save`、`LibraryRepository.load` |
| `ensureMangaTree(name, id)` | 建出 `<root>/<mangaFolderName>/<mangaDirName>/`，返回 `{ outerDir, innerDir }` | `DownloadOrchestratorService.processChapters` |
| `chapterDir(innerDir, title)` | 返回 `join(innerDir, title)`；若它 `resolve` 后的父目录不是 `innerDir`，抛 `Unsafe chapter folder name …` | `DownloadOrchestratorService.processOneChapter` |
| `writeImage(chapterDir, fileName, data)` | 建目录后写文件，返回完整路径 | `ImageDownloaderService.downloadOne` |
| `writeFile(filePath, data)` | 建父目录后写文件 | `ThumbnailService.save`、`LibraryRepository.flushAtomic` |
| `readFile(filePath)` | 读成 `Buffer` | `ThumbnailService.readThumbnail`（后者生产代码无调用方） |
| `readJson<T>(filePath)` | 按 UTF-8 读并 `JSON.parse` | `LibraryRepository.load` |
| `writeJson(filePath, data)` | 建父目录，4 空格缩进写 JSON | 生产代码无调用方 |
| `exists(path)` | `fs.access` 成功为真 | `ThumbnailService.getThumbnailPath`、`LibraryRepository.load`、`LibraryService.deleteManga` |
| `listDir(path)` | `readdir`；任何错误只告警并返回 `[]` | `ArchiveService.rezipDownloadRoot` |
| `removeDir(path)` | `rm -rf`（`recursive: true, force: true`） | `ArchiveService.zipDir`、`DownloadOrchestratorService.processOneChapter`、`LibraryService.deleteManga` |
| `removeFile(path)` | 删除一个文件，不存在不算错（`force: true`） | `ThumbnailService.remove` |
| `getDownloadRoot()` | 返回下载根目录 | `ArchiveService.rezipDownloadRoot` |

实现说明：`chapterDir` 的理由（注释）：章节目录之后会被删除或打包后删除，所以它绝不能是 `innerDir` 本身或更上层。这是 `sanitiseTitle` 之后的第二道检查。

### `filesystem/archive.service.ts`

打包。单测：无。

导出类型：`RezipResult { scannedManga; zippedChapters; skipped: string[]; errors: string[] }`。构造依赖：`FilesystemService`。

#### `zipDir(dir, { enforceFlat = false } = {}): Promise<boolean>`

- **作用**：把目录内容打包成同级的 `<dir>.zip`，然后删除原目录，返回 `true`。`enforceFlat` 为真且目录里有子目录时什么都不做，返回 `false`。
- **调用方**：`rezipDownloadRoot`（`enforceFlat: true`）、`zipChapter`（`enforceFlat: false`）。
- **实现说明**：用 `archiver('zip', { zlib: { level: 9 } })`；`archive.glob('**/*', { cwd: dir, ignore: ['~$*'], dot: false })`，所以以 `~$` 开头的文件和点开头的隐藏文件不进压缩包（`~$` 规则与 `utils/generate_file_path.py` 相同）。输出流 `close` 时完成；`warning` 中 `ENOENT` 只告警，其他视为失败。打包失败时原目录保留，可能留下不完整的 zip 文件（未清理）。已存在的同名 zip 会被覆盖。对应 `utils/generate_file_path.py:do_zip_compress` 与 `utils/re_zip_downloaded.py:do_zip_compress`。

#### `rezipDownloadRoot(): Promise<RezipResult>`

- **作用**：遍历 `{root}/{外层}/{内层}/{章节}`，对每个不以 `.zip` 结尾的章节项调用 `zipDir(..., { enforceFlat: true })`：成功计入 `zippedChapters`；返回 `false`（章节目录里还有子目录，结构异常）计入 `skipped` 并告警；抛错计入 `errors`。每个外层项计一次 `scannedManga`。
- **调用方**：`DownloadOrchestratorService.runRezip`。
- **实现说明**：`listDir` 吞掉所有错误，所以外层的 `try/catch` 很少触发：根目录或某一层不是目录时，只是得到空列表加一条告警。章节层的非 zip 普通文件会让 `zipDir` 的 `readdir` 抛 `ENOTDIR`，计入 `errors`。对应 `utils/re_zip_downloaded.py:re_zip_downloaded`。

#### `zipChapter(chapterDir): Promise<string>`

- **作用**：`zipDir(chapterDir, { enforceFlat: false })`，返回 `<目录名>.zip`。
- **调用方**：`DownloadOrchestratorService.processOneChapter`（不使用返回值）。

### `filesystem/thumbnail.service.ts`

封面文件。单测：有（`thumbnail.service.spec.ts`）。

导出类型：`ThumbnailInput { manga_id; thumbnail /* base64 */ }`。构造依赖：`ConfigService`（`storage.thumbnailsDir`）、`FilesystemService`。

| 方法 | 作用 | 调用方 |
|---|---|---|
| `save(manga)` | 建封面目录，把 base64 解码写成 `<id>.jpg`，返回文件名 | `persistAndLink` |
| `persistAndLink(manga)` | `save` 后返回副本，`thumbnail` 改成 `/api/library/${encodeURIComponent(id)}/thumbnail` | `LibraryService.addManga` |
| `getThumbnailPath(id)` | 拼出 `<dir>/<id>.jpg`；父目录 `resolve` 后不是封面目录（id 想逃出目录）或文件不存在 → 抛 `NotFoundException` | `sendThumbnail`、`readThumbnail` |
| `remove(id)` | 同样的目录检查（不通过就静默返回），`removeFile`；出错只告警，从不抛错 | `LibraryService.deleteManga` |
| `readThumbnail(id)` | `getThumbnailPath` 后读成 `Buffer` | 生产代码无调用方 |

实现说明：`persistAndLink` 存相对地址的理由（注释）：Flask 把 `MANGA_BASE_WEBSOCKET_URL` 写进了记录；相对地址让库文件与部署域名无关。`save` 不做路径检查，依赖 `ScraperService.search` 已过滤掉不安全的 id（见第 5 节）。

---

## 8. 实时推送 `modules/events/`

### `events/events.module.ts`

全局模块，提供并导出 `EventsGateway`。单测：无。

### `events/events.types.ts`

七个 Socket 事件的名字与载荷。单测：无。

| 导出 | 内容 |
|---|---|
| `DownloadTaskKind` | `'full-manga' \| 'redownload'` |
| `DownloadStartedPayload` | `{ manga_id, kind }` |
| `DownloadProgressPayload` | `{ manga_id, chapters_total, chapters_done /* 含失败 */, chapters_failed }` |
| `ChapterCompletedPayload` | `{ manga_id, chapter_index, chapter_title /* 改写后，同压缩包名 */, last_epi, last_epi_name, updated_at }` |
| `DownloadCompletedPayload` | `{ manga_id, kind, status: 'done' \| 'failed', chapters_total, chapters_failed, manga: ApiManga \| null /* DMCA 删除后为 null */ }` |
| `DmcaAlertPayload` | `{ manga_id, manga_name }` |
| `SOCKET_EVENTS` | `DOWNLOAD_STARTED: 'download_started'`、`DOWNLOAD_PROGRESS: 'download_progress'`、`CHAPTER_COMPLETED: 'chapter_completed'`、`DOWNLOAD_COMPLETED: 'download_completed'`、`QUEUE_UPDATED: 'queue_updated'`、`SCAN_COMPLETED: 'scan_completed'`、`DMCA_ALERT: 'dmca_alert'` |

`queue_updated` 的载荷是 `QueueSnapshot`，`scan_completed` 无载荷。

### `events/events.gateway.ts`

Socket.IO 网关，只向客户端广播。单测：有（`events.gateway.spec.ts`）。

装饰器：`@WebSocketGateway({ transports: ['websocket', 'polling'] })`，不设 `cors`（同源；`CORS_ORIGINS` 通过 `CorsIoAdapter` 开启）。`@WebSocketServer() server: Server`。

| 方法 | 作用 | 调用方 |
|---|---|---|
| `afterInit()` | 日志 `Socket.IO gateway initialised` | 由 Nest 在网关初始化后调用 |
| `handleConnection(client)` | debug 日志 | Nest，每个连接 |
| `handleDisconnect(client)` | debug 日志 | Nest，每次断开 |
| `emitDownloadStarted(p)` | 广播 `download_started` | `DownloadOrchestratorService.announceStart` |
| `emitDownloadProgress(p)` | 广播 `download_progress` | `DownloadOrchestratorService.processChapters` |
| `emitChapterCompleted(p)` | 广播 `chapter_completed` | `DownloadOrchestratorService.processOneChapter` |
| `emitDownloadCompleted(p)` | 广播 `download_completed` | `DownloadOrchestratorService.announceEnd` |
| `handleQueueChanged(snapshot)`（`@OnEvent(QUEUE_CHANGED)`） | 广播 `queue_updated` | 事件 `queue.changed` 触发 |
| `emitScanCompleted()` | 广播 `scan_completed`（无载荷） | `DownloadOrchestratorService.runRezip` |
| `emitDmcaAlert(p)` | 广播 `dmca_alert` | `DownloadOrchestratorService.handleDmca` |
| `emit(event, ...args)`（私有） | `this.server?.emit(...)` | 以上所有广播方法 |

实现说明：`emit` 用可选链的理由（注释）：队列在模块初始化期间就可能变化（恢复的任务开始执行），那时 Socket 服务器还不存在。没有任何 `@SubscribeMessage` 处理器，客户端发来的消息被忽略。没有认证，所有连接都收到所有事件。

---

## 9. 定时任务 `modules/scheduler/`

### `scheduler/scheduler.module.ts`

见 0.1。`ScheduleModule.forRoot()` 在这里注册。单测：无。

### `scheduler/scheduler.service.ts`

替代 Flask-APScheduler 的三个任务：每日 01:30 扫描（`dogemangaTask`）、每 6 小时 Kavita 同步（`kavitaTask`）、Cloudflare 动态复查（`cfMonitor`）；另在启动时跑一次 `boot_scanning`。单测：有（`scheduler.service.spec.ts`）。

构造依赖：`SchedulerRegistry`、`LibraryRepository`、`ScraperService`、`DownloadService`、`KavitaService`、`CloudflareService`、`EventsGateway`、`ConfigService`。其中 `EventsGateway` 和 `ConfigService` 注入了但没有使用。

常量：`CF_MONITOR_KEY = 'cf-monitor'`、`CF_MONITOR_MS = 720_000`（12 分钟）。

#### `onModuleInit(): Promise<void>`

- **作用**：
  1. Kavita 已启用 → 日志，后台 `void kavita.syncLibrary().catch(告警)`。
  2. `setImmediate(() => void this.safeScan('Boot scan'))`。
- **调用方**：由 Nest 在启动时调用。
- **实现说明**：注释：Kavita 同步放后台，因为 Flask 版等待它，Kavita 连不上时启动就卡住；启动扫描不依赖 `kavita_url`，请求受 `KavitaModule` 的 HTTP 超时约束。启动扫描也放后台，不阻塞模块初始化；用 `safeScan` 包住，因为未处理的拒绝会让进程退出。

#### `handleDailyScan(): Promise<void>` — `@Cron('0 30 1 * * *', { name: 'daily-scan' })`

- **作用**：日志 → `safeScan('Daily scan')` → 日志。
- **调用方**：定时触发，每天 01:30:00（六段式 cron，第一段是秒）。没有指定 `timeZone`，按进程本地时区（容器里未设 `TZ` 时通常是 UTC，未确认部署环境）。
- **实现说明**：没有防重入：上一次扫描（包括启动扫描）还没结束时，每日扫描会并行开始。重复入队由 `TaskQueueService` 去重，但两个扫描会各自调用源站。

#### `safeScan(label): Promise<void>`（私有）

- **作用**：`await bootScan()`，任何错误写 `<label> failed: …` 错误日志，不抛出。
- **调用方**：`onModuleInit`（经 `setImmediate`）、`handleDailyScan`。

#### `handleKavitaSync(): Promise<void>` — `@Interval('kavita-sync', 6 * 60 * 60 * 1000)`

- **作用**：日志 → `kavita.syncLibrary()` → 日志。
- **调用方**：定时触发，每 6 小时（从进程启动算起）。Kavita 未启用时也会触发，只是 `syncLibrary` 立即返回 0。
- **实现说明**：`syncLibrary` 内部吞掉所有已知错误；这里没有 `try/catch`，若它意外抛错，由 `@nestjs/schedule` 处理（行为未确认）。

#### `cfProbe(): Promise<void>`（私有）

- **作用**：探测 Cloudflare 状态并管理复查定时器。
  1. FlareSolverr 未配置 → debug 日志，`removeCfMonitor()`，返回。
  2. 动态导入 `axios`，`GET https://dogemanga.com`（`timeout: 15_000`，`User-Agent: DEFAULT_BROWSER_USER_AGENT`，`validateStatus: () => true`，`maxRedirects: 5`）。
  3. `cloudflare.isCloudflareChallenged(status, data)` 为真 → `solveChallenge(targetUrl)` → `ensureCfMonitor()`。
  4. 否则 → `cloudflare.reset()`，`removeCfMonitor()`。
  5. 任何异常（网络错误、FlareSolverr 失败）→ 告警 `CF probe failed: …`；复查定时器保持原状。
- **调用方**：`bootScan`（每次扫描开头）、复查定时器（每 12 分钟）。
- **实现说明**：带浏览器 UA 的理由（注释）：不带的话即使没有验证 Cloudflare 也回 403，会被永远当成"有验证"。`solveChallenge` 失败时 `CloudflareService` 的 `active` 已被设为真（见第 11 节），而定时器没有注册，下一次复查只能等下一次扫描。

**Cloudflare 复查的生命周期**：

```
扫描开头 cfProbe
  ├─ 未配置 FlareSolverr → 注销复查（若有）
  ├─ 有验证 → 求解 → 注册复查（若无）── 每 12 分钟 cfProbe ─┐
  └─ 无验证 → 清空状态 → 注销复查（若有）                   │
                                    ↑───────────────────────┘
```

#### `ensureCfMonitor()`、`removeCfMonitor()`（私有）

- **作用**：
  - `ensureCfMonitor`：`SchedulerRegistry` 里没有 `cf-monitor` 时，`setInterval(() => void this.cfProbe(), 720_000)` 并 `addInterval('cf-monitor', …)`，日志。
  - `removeCfMonitor`：存在时 `deleteInterval('cf-monitor')`（会清除定时器），日志。
- **调用方**：`cfProbe`。
- **实现说明**：两个方法都先查是否存在，所以重复调用无害。

#### `bootScan(): Promise<void>`（私有）

- **作用**：扫描全库，决定哪些漫画需要排入 full-manga 任务。
  1. `await cfProbe()`。
  2. `repo.list()` 为空 → 日志，返回。
  3. 倒序遍历（与 Python 的 `reversed(manga_library.values())` 一致），按下表处理每一部：

| 条件（按顺序判断） | 处理 | 之后等 1 秒？ |
|---|---|---|
| `repo.has(id)` 为假（扫描期间被删除） | 跳过 | 否 |
| `!manga.completed`（首次下载未完成） | `submit(...)` | 否 |
| `manga.download_switch === 1`（已下完且自动更新关闭） | 跳过 | 否 |
| `getMetadata` 返回 `errorCode` 501 或 504 | 告警，跳过 | 否 |
| `manga.last_epi < meta.chapterCount` | `submit(...)` | 是 |
| 其他（没有新章节，或 `errorCode` 为 503 等其他值时按 `chapterCount` 比较） | 不处理 | 是 |
| `getMetadata` 抛错 | 错误日志 | 是 |

  4. 日志 `=== Boot scan completed ===`。
- **调用方**：`safeScan`。
- **实现说明**：
  - 扫描基于开始时的快照，真实的库要跑好几分钟；期间被用户或 DMCA 删掉的漫画在 `has` 检查时跳过（注释）。
  - 1 秒间隔只在向源站查询过之后（对应 `gevent.sleep(1)`）。501/504 的 `continue` 写在 `try` 里，会跳过这次等待。
  - 504 在这里只跳过，不删除漫画；删除只发生在下载任务里。
  - 判断"有新章节"用 `<`；下载任务里判断"已是最新"用 `>`（见第 6 节 `runFullManga`）。

#### `submit(mangaId, mangaName): void`（私有）

- **作用**：`repo.has` 为假则 debug 日志后返回；否则 `downloadService.submitFullManga(id)`，任何错误只告警。
- **调用方**：`bootScan`。
- **实现说明**：注释：从 `has()` 检查到入队之间漫画可能已消失（`MangaNotFoundException`），任何拒绝都只记日志，不让一部漫画终止整个扫描。删除进行中的漫画 `repo.has` 为真，但 `DownloadService` 用的 `LibraryService.has` 为假，会抛 404，这里记一条告警。

#### `sleep(ms)`（私有）

`setTimeout` 包装。调用方：`bootScan`。

---

## 10. Kavita `modules/kavita/`

### `kavita/kavita.module.ts`

见 0.1。HTTP 超时 15 秒、最多 3 次重定向。单测：无。

### `kavita/kavita.service.ts`

Kavita 集成，替代 `utils/kavita_lib_pull.py` 与 `utils/kavita_scan_folder.py`。单测：有（`kavita.service.spec.ts`）。

构造依赖：`HttpService`（`KavitaModule` 的实例）、`ConfigService`、`LibraryRepository`。

#### `handleDownloadCompleted(event): Promise<void>` — `@OnEvent(DOWNLOAD_COMPLETED)`

- **作用**：`scanFolder(event.mangaName, event.mangaId)`，拒绝时告警（`scanFolder` 本身不会拒绝，这层 `catch` 是兜底）。
- **调用方**：事件 `download.completed` 触发（发出方 `DownloadOrchestratorService.runFullManga/runRedownload`）。
- **实现说明**：注释：用事件解除与 `DownloadModule` 的循环依赖。event-emitter 不等待异步监听器，下载任务不会因 Kavita 慢而被拖住。

#### `get enabled(): boolean`

- **作用**：`kavita.enabled`。
- **调用方**：`KavitaController.assertEnabled`、`SchedulerService.onModuleInit`、本类 `syncLibrary`、`scanFolder`。

#### 私有 getter：`baseUrl`、`exposeUrl`、`adminApiKey`、`libId`

读取对应配置。调用方：本类各方法。

#### `authenticate(): Promise<string>`（私有）

- **作用**：`POST ${baseUrl}/api/Plugin/authenticate?apiKey=${adminApiKey}&pluginName=nestjsScanScript`（无请求体），返回 `res.data.token`（JWT）。
- **调用方**：`syncLibrary`、`scanFolder`。
- **实现说明**：每次同步、每次扫描都重新换一次令牌，不缓存。`apiKey` 没有做 URL 编码。

#### `syncLibrary(): Promise<number>`

- **作用**：把 Kavita 系列地址写进库，返回更新条数。
  1. 未启用 → debug 日志，返回 0。
  2. `authenticate()` 失败 → 错误日志，返回 0。
  3. `POST ${baseUrl}/api/Series/all-v2`（请求体 `{}`，`Authorization: Bearer <jwt>`）失败 → 错误日志，返回 0。
  4. 对每个系列：`folderPath` 不含 `$` → 跳过；`mangaId = folderPath.split('$')[1]`；`repo.has(mangaId)` 为假 → 跳过；否则 `repo.update(mangaId, { kavita_url: '${exposeUrl}/library/${libId}/series/${s.id}' })`，计数加一。
  5. 日志，返回计数。
- **调用方**：`SchedulerService.onModuleInit`（后台）、`SchedulerService.handleKavitaSync`。
- **实现说明**：
  - **匹配规则**：漫画顶层目录名是 `<名字>$<id>`（`mangaFolderName`），Kavita 的 `folderPath` 形如 `/manga/<名字>$<id>`，取第一个 `$` 与第二个 `$`（或结尾）之间的部分作为 id。名字本身含 `$` 时会取错（是否存在这种名字未确认）。
  - 每个匹配的系列都写一次库（即使地址没变），每次写入都整库落盘。
  - 直接用 `LibraryRepository`，不经 `LibraryService`，所以不看"删除中"标记；记录已不存在时 `update` 返回 `undefined`，计数仍加一。
  - 没有分页参数；`all-v2` 是否一次返回全部系列未确认。

#### `scanFolder(mangaName, mangaId): Promise<boolean>`

- **作用**：让 Kavita 扫描一部漫画的目录。未启用 → `false`。`authenticate()` 失败 → 错误日志，`false`。`POST ${baseUrl}/api/Library/scan-folder`，请求体 `{ apiKey: adminApiKey, folderPath: '/manga/' + mangaFolderName(name, id) }`，带 Bearer；状态 200 → 日志，`true`；其他状态 `false`；请求出错 → 错误日志，`false`。从不抛错。
- **调用方**：`handleDownloadCompleted`。
- **实现说明**：路径前缀 `/manga/` 写死，假设 Kavita 容器把下载根目录挂载在 `/manga`。

#### `login(username, password)`

- **作用**：`POST ${baseUrl}/api/Account/login`，请求体 `{ username, password, apiKey: '' }`；返回 `{ apiKey, jwt: data.token, refreshToken, loginUrl: '${exposeUrl}/login?apiKey=${apiKey}' }`。上游错误原样抛出（axios 错误）。
- **调用方**：`KavitaController.login`。

#### `refreshToken(jwt, refreshToken)`

- **作用**：`POST ${exposeUrl}/api/Account/refresh-token`，请求体 `{ token: jwt, refreshToken }`；返回 `{ jwt: data.token, refreshToken }`。上游错误原样抛出。
- **调用方**：`KavitaController.refreshToken`。
- **实现说明**：这里用的是 `exposeUrl`（浏览器访问 Kavita 的地址），而其他所有调用用的是 `baseUrl`（服务端访问地址）。两者不同的部署里（例如 `baseUrl` 是容器内网地址），刷新请求要从服务端访问对外地址。是否有意为之未确认（注释只说替代 `main.py` 的 `KavitaRefreshToken`）。

### `kavita/kavita.controller.ts`

`@ApiTags('kavita')`、`@Controller('kavita')`。单测：有（`kavita.controller.spec.ts`）。

文件内 DTO（每个字段都带装饰器，注释：否则被 `whitelist` 删掉）：`KavitaLoginDto { @IsString() username; @IsString() password }`、`KavitaRefreshDto { @IsString() jwt; @IsString() refreshToken }`。

构造依赖：`KavitaService`。

| 方法 | 路由 | 作用 |
|---|---|---|
| `login(body)` | `POST /api/kavita/login`，`@HttpCode(200)` | `assertEnabled()`；`ok(await kavita.login(...))`；出错 → `upstreamFailure(err, 'kavita-login-failed')` |
| `refreshToken(body)` | `POST /api/kavita/refreshtoken`，`@HttpCode(200)` | 同上，错误码 `kavita-refresh-failed` |
| `assertEnabled()`（私有） | — | 未启用 → `404 kavita-disabled`（`Kavita is not configured on this server`） |
| `upstreamFailure(err, rejected)`（私有） | — | 上游状态 400 或 401 → `403 <rejected>`（`Kavita answered <status>`）；其他 → 告警（带上游消息）并返回 `502 kavita-unreachable`（`Kavita is unreachable or returned an error`） |

调用方：`login`、`refreshToken` 为 HTTP 路由；两个私有方法由它们调用。

实现说明（注释）：Kavita 拒绝账号用 403，因为 401 留给管理口令（前端遇 401 会弹口令框）；上游错误信息里有内部主机名和端口，只进日志。

---

## 11. Cloudflare `modules/cloudflare/`

### `cloudflare/cloudflare.module.ts`

全局模块，`HttpModule` 超时 70 秒、最多 5 次重定向；导出 `CloudflareService` 和 `HttpModule`。单测：无。

### `cloudflare/cloudflare.types.ts`

单测：无。

- `CloudflareState { active: boolean; cfClearance: string | null; userAgent: string | null; updatedAt: Date | null }`
- `FlareSolverrCookie`、`FlareSolverrSolution { url; status; cookies; userAgent; headers?; response? }`、`FlareSolverrResponse { status: 'ok' | 'error'; message; solution?; … }`：FlareSolverr 的响应形状。

### `cloudflare/cloudflare.service.ts`

保存 Cloudflare 状态，通过 FlareSolverr 求解验证。单例，状态在内存。单测：无。

构造依赖：`HttpService`（`CloudflareModule` 的实例）、`ConfigService`。字段：`maxRetries = 5`；`state`（初始全空，`active: false`）。

| 方法 | 作用 | 调用方 |
|---|---|---|
| `isEnabled()` | `flaresolverr.enabled` | `solveChallenge`、`SchedulerService.cfProbe` |
| `getState()` | 返回 `state` 的浅拷贝 | `solveChallenge`、`PythonRunnerService.run`（写进子进程 stdin） |
| `isCloudflareChallenged(status, body)` | `status === 403` 或 `body` 含 `__cf_chl_rt_tk` | `SchedulerService.cfProbe` |
| `solveChallenge(targetUrl)` | 见下 | `SchedulerService.cfProbe` |
| `buildHeaders()` | 有 UA 时 `User-Agent`，有 clearance 时 `Cookie: cf_clearance=…` | `ImageDownloaderService.fetch` |
| `reset()` | 状态清空，`active: false` | `SchedulerService.cfProbe` |

#### `solveChallenge(targetUrl): Promise<CloudflareState>`

- **作用**：
  1. 未配置 → 抛 `ServiceUnavailableException('FlareSolverr is not configured (FLARESOLVERR_URL is empty)')`。
  2. `state.active = true`。
  3. 最多请求 `maxRetries + 1` = 6 次：`POST <FLARESOLVERR_URL>`，请求体 `{ cmd: 'request.get', url: targetUrl, maxTimeout: 60_000, returnOnlyCookies: true }`，请求超时 70 秒；`status === 'ok'` 时停止；请求出错只告警。
  4. 没有响应，或 `status !== 'ok'` 且 `message !== 'Challenge solved!'` → 错误日志，抛 `ServiceUnavailableException('FlareSolverr could not solve the Cloudflare challenge')`。
  5. 取 `solution.cookies` 里名为 `cf_clearance` 的值、`solution.userAgent`，写入状态，`updatedAt = new Date()`，日志，返回状态拷贝。
- **实现说明**：
  - 替代 `utils/flaresolverr_bypasser.py`（注释）。
  - 第 2 步在求解之前就把 `active` 设为真。求解失败时 `active` 保持为真，而 `cfClearance`、`userAgent` 是上一次的值或 `null`；之后 Python 会收到 `active: true` 和空的 clearance，带着空 cookie 去请求。
  - 失败的请求之间没有等待。
  - 第 4 步的条件允许 `status` 为 `error` 但 `message` 为 `Challenge solved!` 的响应通过，此时若没有 `solution`，第 5 步的 `solution!` 会抛 `TypeError`（由 `cfProbe` 捕获并告警）。
  - 抛出的 `ServiceUnavailableException`（503）只在定时任务里出现，不会到达 HTTP 客户端。

---

## 12. 前端托管 `modules/frontend/`

### `frontend/frontend.module.ts`

定义 Vue 构建产物的位置和 `GET /api/config`。文件本身由 `configureApp` 注册的两个 Express 中间件提供：`spaFallback`（前端路由 → `index.html`）和 `app.useStaticAssets(STATIC_ROOT, { index: false, fallthrough: true })`（真实文件）。单测：无（`test/frontend-static.e2e-spec.ts` 覆盖）。

不用 `@nestjs/serve-static` 的理由（`frontend.module.ts` 注释）：它 5.0.5 版的 `ExpressLoader` 在生产启动方式下额外注册了两样东西：一个兜底的 `GET {*any}`，把所有不在 `exclude` 里、静态中间件没找到的 GET（包括 `/assets/nope.js`、`/js/config.js`）答成 `index.html`；一个错误中间件，把 `exclude` 路径（`/api{/*path}`）上的**任何**错误改写成 `NotFoundException("Cannot <METHOD> <url>")`，于是 body-parser 的 400（非法 JSON、JSON `null`/字符串）和 413（超过 1 MB）都变成了 404。用 `Test.createTestingModule` 启动时，它的加载器在 HTTP 适配器存在之前就被创建，退化成 `NoopLoader`，什么都不注册，所以旧的 e2e 没发现。已在提交 `d3fcf0b` 中移除。

#### `STATIC_ROOT`（导出常量）

- **作用**：`resolve(__dirname, '..', '..', '..', '..', 'frontend', 'dist')`。运行时 `__dirname` 是 `backend/dist/modules/frontend`，向上四级是仓库根目录；在 ts-jest 下是 `backend/src/modules/frontend`，同样向上四级到根目录。镜像里目录结构与仓库相同（`/app/backend/dist/...` → `/app/frontend/dist`）。
- **调用方**：`app.setup.ts → configureApp`（`useStaticAssets`）、`spa-fallback.ts`。

#### `FrontendModule`

- **作用**：导入 `ConfigModule`；控制器 `FrontendController`。
- **实现说明**：`useStaticAssets` 的 `index: false`：不自动返回 `index.html`，由 `spaFallback` 负责。`fallthrough: true`：找不到文件时交给后续处理（最终是 Nest 的 404 `not-found` 信封）。

### `frontend/spa-fallback.ts`

#### `spaFallback(req, res, next): void`

- **作用**：满足四个条件时用 `res.sendFile(join(STATIC_ROOT, 'index.html'))` 返回单页入口：方法是 `GET` 或 `HEAD`；路径不以 `/api/` 开头；不以 `/socket.io` 开头；没有扩展名（`path.extname` 为空）。发送失败（例如 `frontend/dist` 没构建）时 `next()`。其他请求直接 `next()`。
- **调用方**：Express，对每个请求（由 `configureApp` 用 `app.use` 注册）。单测：无（e2e 覆盖）。
- **实现说明**（注释）：只处理不带扩展名的路径，所以带哈希的静态资源（如 `/assets/index-abc.js`）不会被 `index.html` 遮住，缺失的资源得到 404 而不是 HTML；也因为有这个门槛，它可以注册在 Nest 路由之前而不拦截接口。几个边界：路径恰好是 `/api`（没有结尾斜杠）会得到 `index.html`；前端路由里若含 `.`（如 `/library/a.b`）会被当成静态资源，得到 404。

### `frontend/frontend.controller.ts`

单测：有（`frontend.controller.spec.ts`）。

导出类型：`RuntimeConfig { kavitaEnabled: boolean; kavitaExposeUrl: string | null; adminRequired: boolean }`。

#### `constructor(config)`

- **作用**：构造时一次算好 `runtime`：`kavitaEnabled = kavita.enabled`；`kavitaExposeUrl` 在启用时为 `kavita.exposeUrl`，否则 `null`；`adminRequired = security.adminToken !== ''`。

#### `getConfig()` — `GET /api/config`

- **作用**：`ok(this.runtime)`。无失败分支。
- **调用方**：HTTP 路由。

---

## 13. 后端 e2e 测试 `backend/test/`

### `test/jest-e2e.json`

Jest 配置：`rootDir: '.'`，匹配 `.e2e-spec.ts$`，`ts-jest` 转译，Node 环境，`@/` 映射到 `../src/`。由 `npm run test:e2e` 使用。

四个文件都用 `src/bootstrap.ts` 的 `createApp({ logger: ['error'], abortOnError: false })` 加 `await app.init()` 启动，与 `main.ts` 走同一条装配路径（`NestFactory.create` + `configureApp` + Swagger），只少了信任库检查和 `listen`（supertest 直接用 `app.getHttpServer()`）。不再用 `Test.createTestingModule`：它与生产行为不同，曾掩盖了第 12 节所述的两个问题。`createApp` 在设置环境变量后才动态导入（`configuration()` 在构建模块图时读取环境变量）。四个文件都用临时目录存放库、队列、下载、封面，测完删除。

### `test/api-contract.e2e-spec.ts`

在生产装配的应用上逐项核对接口契约。`PYTHON_EXECUTABLE` 设为 `process.execPath`、`PYTHON_CLI_SCRIPT` 设为 `fake-cli.cjs`；设 `ADMIN_TOKEN`；清空 Kavita 与 FlareSolverr 变量。覆盖：`GET /api/config` 的内容；搜索（无结果为 `[]`、空 `q` 为 400 `query-required`、候选的 `thumbnail` 是缓存地址且能取到 JPEG）；添加（精简请求体、`already-in-library` 带 `data.manga`、相似标题 `duplicate` 及用 `submit_sign: '1'` 确认、未搜索过的 id 为 410 `search-expired`）；等待队列空闲后记录变为 `completed: true`、`updated_at` 与 `add_date` 的关系；通过监视 `EventsGateway.server.emit` 检查 `download_started`、`download_completed`（`chapters_total: 0`）、`queue_updated` 的内容，且没有七个规范事件以外的事件；封面、章节列表接口；库文件里存的是相对封面地址；删除的口令保护（缺失、错误、正确）、删除后封面文件被删、再删为 404；`queue.json` 写在库文件旁边且最终为 `{ version: 1, tasks: [] }`；`POST /api/library/rezip` 需要口令；默认不发 CORS 头（HTTP 预检、普通请求、Socket.IO 轮询）；未知路由与空请求体的失败信封；非法 JSON、JSON `null`、JSON 字符串请求体为 400 `bad-request`；约 2000 章的重下请求体能被解析而超过 1 MB 的请求体得到 `{ code: 413, error: 'payload-too-large' }`；Swagger 文档包含全部规范路由、不含已删除的旧路由，两条受保护路由声明了 `admin-token` 安全方案。

### `test/cors.e2e-spec.ts`

设 `CORS_ORIGINS=' http://allowed.example , http://other.example '`（带空白，验证拆分与 `trim`）后启动应用。覆盖：列出的来源在 HTTP 预检中得到 `access-control-allow-origin`；未列出的来源得不到；Socket.IO 轮询请求使用同一名单。默认情况（不发头）在 `api-contract.e2e-spec.ts` 里测。没有设置 `PYTHON_EXECUTABLE`，但库为空，启动扫描不会调用抓取器。

### `test/frontend-static.e2e-spec.ts`

临时数据目录，需要先构建 `frontend/dist`。覆盖：`GET /` 和前端路由 `/settings`、`/mainpage/mangaku`、`/library/abc` 返回含 `<div id="app"` 的 `index.html`；`HEAD /settings` 为 200；`index.html` 引用的 `assets/index-*.js` 与 `/favicon.ico` 为 200；`GET /js/config.js`（已删除的旧接口）与缺失的资源 `/assets/missing-abc.js`、`/assets/nope.js`、`/nope.png` 为 404 `not-found` 信封，而不是 `index.html`；`POST /settings` 为 404。

### `test/queue-restore.e2e-spec.ts`

重启恢复（契约 §3.4）。启动前写好库文件（`-r1`、`-r2` 已完成且 `download_switch: 1`，启动扫描跳过；`-r3` 未完成，启动扫描会排入全量下载）和 `queue.json`（`full-manga -r1`、`full-manga -gone`（库里没有）、`redownload -r2`），在启动前监视 `EventsGateway.prototype.emitDownloadStarted`，然后 `createApp` + `init`。等队列空闲后断言：`download_started` 依次是 `-r1 full-manga`、`-r2 redownload`、`-r3 full-manga`（恢复的任务按顺序、在启动扫描的任务之前执行，`-gone` 被跳过而队列继续）；库文件里三条记录都在，`-r1`、`-r3` 被下载流程写成 `completed: true, serialization: 1`；`queue.json` 最终为空。修复前（执行器在 `onModuleInit` 登记）只会看到 `-r3`。

---

## 14. Python 抓取器

### 14.1 `scrape_cli.py`

Node 每次抓取启动一个它的子进程。约定（文件头注释）：参数决定源与命令；Cloudflare 状态从 `--cf-state` 或 stdin 读；旧模块的 `print()` 全部重定向到 stderr；stdout 只输出一行 JSON：`{ "ok": true, "data": … }` 或 `{ "ok": false, "errorCode": <int|null>, "error": "…" }`。

#### 模块级：`_REAL_STDOUT = sys.stdout`；`sys.stdout = sys.stderr`

- **作用**：保存真正的 stdout，此后所有 `print()`（包括被导入模块里的）都写到 stderr。
- **实现说明**：Node 只解析 stdout 的最后一行，旧代码大量 `print` 调试信息，必须隔离。

#### `_emit(payload)`

- **作用**：`json.dumps(payload, ensure_ascii=False)` 写到真正的 stdout，加换行，`flush`。
- **调用方**：`main`（四处）。

#### `_build_cf_dict(raw)`

- **作用**：把 Node 传来的 `{ active, cfClearance, userAgent }` 转成旧代码用的 `CF_dict`：`cf_activate`（bool）、`cf_clearance_value`（缺省 `""`）、`cf_userAgent`（缺省 `""`）、`updateTime: None`。
- **调用方**：`main`。

#### `_read_cf_state(arg_value)`

- **作用**：`--cf-state` 非空 → 解析它；否则 stdin 不是终端 → 读完 stdin，非空则解析；否则 `{}`。
- **调用方**：`main`。
- **实现说明**：Node 不使用 `--cf-state`，总是通过 stdin 传入。在终端手动运行时 stdin 是终端，不会阻塞等待输入。JSON 解析失败会抛异常，由 `main` 的 `except` 输出为 `ok: false`。

#### `_dgmanga_search(query, cf)`

- **作用**：`DGmanga(manga_id="").search_manga(query, cf)`。返回候选列表或整数 `457`。
- **调用方**：`main`（经 `SOURCE_REGISTRY`）。可达：是。

#### `_dgmanga_metadata(manga_id, cf)`

- **作用**：`check_manga_length(cf)` 返回 `[count, serialization]`；`count == 501` → `{ errorCode: 501, chapterCount: 0, serialization: 0 }`；否则 `{ chapterCount, serialization }`。
- **调用方**：`main`。可达：是。
- **实现说明**：`check_manga_length` 遇到任何解析异常都返回 `[501, 0]`，所以页面结构变化、DMCA 页、Cloudflare 页在 Node 看来都是 501（Cloudflare 拦截）。理论上一部恰好有 501 话的漫画也会被当成 501（未确认是否存在）。

#### `_dgmanga_chapters(manga_id, cf)`

- **作用**：`comic_main_page(manga_id, cf)`；返回 `501` → `{ errorCode: 501, chapters: [] }`；否则把源站从新到旧的列表反转成从旧到新，生成 `{ index: 位置+1, title, url }` 列表。
- **调用方**：`main`。可达：是。
- **实现说明**：`index` 是按列表位置生成的，不是源站给的话数。源站若在中间插入或删掉章节，后面所有章节的 `index` 都会移动，基于 `last_epi` 的续下会对不上（推论）。

#### `_dgmanga_chapter_images(chapter_url, cf)`

- **作用**：只解析一章的图片地址，不下载。
  1. `SessionPage().get(chapter_url, timeout=30)`；Cloudflare 激活时带 `User-Agent` 和 `cf_clearance` cookie。
  2. 没有响应 → `{ errorCode: 503, chapterTitle: "", imageUrls: [] }`；状态 429 → `{ errorCode: 429, … }`。
  3. 用 lxml 解析，找 `div.site-reader` 下带 `data-page-image-url` 的 `img`；找不到（`site-reader` 不存在等）→ `errorCode: 503`。
  4. 每个 `img`：用 `第\s\d+\s[页|頁]` 从 `alt` 取页码文字（取不到为空串），地址原样取 `data-page-image-url`。
  5. Cloudflare 激活时 `requestHeaders` 带 `User-Agent` 和 `Cookie: cf_clearance=…`，否则为空。
  6. 返回 `{ chapterTitle: "", imageUrls, imagePages, requestHeaders }`。
- **调用方**：`main`。可达：是。
- **实现说明**：逻辑对应 `DGmanga.scrape_each_chapter` 的解析部分，但不调用 `download_img`（下载由 Node 完成），也不使用 `DGmanga` 类。30 秒超时的理由（注释）：防止 Cloudflare 挂起或死连接把整个 Node 下载任务拖到 180 秒的子进程超时。不再像旧代码那样重建地址并追加 `?l=zh`（注释：`data-page-image-url` 已是完整的图片地址，`?l=zh` 属于页面地址而不是图片）。`chapterTitle` 为空串，因为 Node 已从章节列表得知标题。`imagePages` 被 Node 丢弃。正则里的 `[页|頁]` 是字符类，`|` 也会被当成一个可匹配的字符。

#### `SOURCE_REGISTRY`

- **作用**：`{ "dgmanga": { "search", "metadata", "chapters", "chapter-images" → 对应处理函数 } }`。注释：新增源时唯一要改的地方。
- **调用方**：`main`。

#### `main() -> int`

- **作用**：
  1. argparse：`--source`（必填，取值限于 `SOURCE_REGISTRY` 的键）、`--cf-state`（默认空）；子命令 `search <query>`、`metadata <manga_id>`、`chapters <manga_id>`、`chapter-images <chapter_url>`。
  2. 找处理函数；找不到 → 输出 `ok: false, errorCode: None, error: "Unsupported command: …"`，返回 2（argparse 已限制了子命令，dgmanga 四个命令都有，这条路径当前走不到）。
  3. 构造 `cf_dict`，按命令调用处理函数。
  4. 结果是 `int`（旧代码的哨兵值，如搜索失败的 457）→ 输出 `ok: false, errorCode: <int>, error: "Source returned status <int>"`，返回 0。
  5. 否则输出 `ok: true, data`，返回 0。
  6. 任何异常 → 把堆栈打到 stderr，输出 `ok: false, errorCode: None, error: str(e)`，返回 1。
- **调用方**：`if __name__ == "__main__": sys.exit(main())`；Node 通过 `PythonRunnerService.run` 启动进程。
- **实现说明**：Node 传入的参数形如 `--source dgmanga search -- <query>`，`--` 由子命令解析器处理，保证以 `-` 开头的 id 被当成位置参数。退出码 Node 只用于日志。`modules.DGmanga`、`bs4`、`DrissionPage` 都在处理函数内部导入，所以 `--help` 不会触发这些导入（CI 和 Dockerfile 因此另做一次显式导入检查）。

### 14.2 `modules/DGmanga.py`

DogeManga 页面解析。顶部导入：`base64`、`random`、`re`、`gevent`、`defaultdict`、`bs4.BeautifulSoup`、`DrissionPage.SessionPage`、`threading.current_thread`、`modules.MangaSite.MangaSite`、`utils.make_path.path_exists_make`、`utils.generate_file_path.do_zip_compress`、`utils.chapter_title_reformat.chapter_title_reformat`。

迁移后从 `scrape_cli.py` 可达的方法：

| 方法 | 从 `scrape_cli.py` 可达 | 调用方 |
|---|---|---|
| `__init__` | 是 | `_dgmanga_search`、`_dgmanga_metadata`、`_dgmanga_chapters` |
| `search_manga` | 是 | `_dgmanga_search` |
| `check_manga_length` | 是 | `_dgmanga_metadata` |
| `comic_main_page` | 是 | `_dgmanga_chapters`（另被死方法 `generate_chapters_array` 调用） |
| `generate_chapters_array` | 否（遗留） | 无 |
| `scrape_each_chapter` | 否（遗留） | 无 |
| `download_single_chapter` | 否（遗留） | 无 |
| `download_img` | 否（遗留） | 仅被 `scrape_each_chapter`、`download_single_chapter` 及自身递归调用 |

遗留方法不能直接删：`MangaSite` 把 `generate_chapters_array`、`scrape_each_chapter` 声明为抽象方法，删掉后 `DGmanga` 无法实例化。顶部导入的 `gevent`、`random`、`current_thread`、`path_exists_make`、`do_zip_compress`、`chapter_title_reformat` 只被遗留方法使用，但导入失败会让整个模块无法加载，所以 `utils/` 下这三个文件和 `gevent` 依赖仍是必需的。

#### `__init__(self, manga_id)`

- **作用**：保存 `manga_id`；初始化 `target_folder_path = ""`、`Current_idx = -inf`、`download_failed_count = 0`（后三个只被遗留方法使用）。

#### `search_manga(self, search_name, CF_dict)`

- **作用**：
  1. `GET https://dogemanga.com/?q={search_name}&l=zh`（Cloudflare 激活时带 UA 和 cookie）。
  2. 在 `div.site-scroll__row` 里取所有 `div.site-card`，最多前 10 个。
  3. 每张卡片取 `data-manga-id`、`h5.card-title`、`h6.card-subtitle`、第一个 `li.list-group-item` 的文字（去换行、去首尾空白），和 `img.card-img-top` 的 `src`；用同一个会话依次下载封面并 base64 编码。
  4. 返回 `defaultdict` 列表（字段 `manga_name`、`manga_id`、`artist_name`、`newest_epi`、`thumbnail`）。
  5. `try` 块内任何异常（例如没有结果时找不到 `site-scroll__row`，`None.find_all` 抛错）→ 打印并返回 `457`。
- **实现说明**：搜索词直接拼进地址，没有 URL 编码，含 `&`、`#` 的搜索词会出错。请求没有设置超时，只受 Node 侧 180 秒子进程超时约束。请求本身失败（`response` 为 `None`）发生在 `try` 之外，异常冒到 `main`，Node 得到 502 `scraper-failed`。

#### `check_manga_length(self, CF_dict)`

- **作用**：
  1. `GET https://dogemanga.com/m/{manga_id}?l=zh`。
  2. 在 `div.site-main-content` → `div.site-card` → `small.text-muted` 的文字中，任一行含 `連載中` 则 `serialization = 0`，否则 1。
  3. 数 `.tab-content > #site-manga__tab-pane-all` 下 `a.site-manga-thumbnail__link` 的个数作为章节数。
  4. 返回 `[章节数, serialization]`；`try` 内任何异常 → `[501, 0]`。
- **实现说明**：章节数与 `comic_main_page` 数的是同一组链接，所以 `chapterCount` 等于章节列表长度。没有任何分支返回 504，`scrape_cli.py` 也不产生 504，所以 Node 侧的 DMCA 处理（`dmca`、`dmca_alert`）当前不会被触发。

#### `comic_main_page(self, target, CF_dict)`

- **作用**：
  1. `GET https://dogemanga.com/m/{target}?l=zh`。
  2. 取同一组 `a.site-manga-thumbnail__link`；每个取 `href` 和 `span.text-center` 的文字。
  3. 文字先用 `^\s+|\s+$` 去首尾空白，再用一个"emoji"字符类删除字符。
  4. 返回 `[[title, link], ...]`（源站顺序，从新到旧）；`try` 内任何异常 → `501`。
- **实现说明**：删除 emoji 的字符类是 `[\U0001F300-\U0001F64F\U0001F680-\U0001F6FF☀-⭕ \U00010000-\U0010ffff]+`，`⭕` 后面有一个空格，所以**标题里的所有空格也被删除**（例如源站的 `第 12 話` 变成 `第12話`）。这影响章节目录名和压缩包名，Node 侧照单全收。正则字符串不是原始字符串，`\s` 在新版 Python 中会产生 `SyntaxWarning`/`DeprecationWarning`（不影响结果）。

#### `generate_chapters_array(self, start, end, download_root_folder_path, manga_name, CF_dict)`（遗留）

- **作用**：名字里的 `/` 换成 `-`，建出 `<根>/<名字>$<id>/<名字>` 目录，取 `comic_main_page`，反转后切出 `[start-1:end]`。返回切片或 `501`。
- **调用方**：无（Flask 版 `main.py` 曾调用，已删除）。

#### `scrape_each_chapter(self, chapter, manga_library, Error_dict, his_length, idx, app, CF_dict)`（遗留）

- **作用**：在 Flask `app.app_context()` 里：改写章节名；请求章节页；429 时设置共享标志 `Error_dict["g_error_flag"]`、计数加一（上限 6）、`gevent.sleep(g_wait_time × 计数 + 随机 0–9)` 后递归重试；解析图片列表；`download_img`；成功时更新传入的 `manga_library` 里的 `last_epi`、`last_epi_name`。返回值为 `503`、`502`、`(503, title)` 或 `(序号, 标题, 是否推进)`。
- **调用方**：无。Node 的 `DownloadOrchestratorService.processOneChapter`、`scrapeChapterImages` 与 `_dgmanga_chapter_images` 一起取代了它。

#### `download_single_chapter(self, chapter, Error_dict, app, download_root_folder_path, manga_name, CF_dict)`（遗留）

- **作用**：与 `scrape_each_chapter` 类似，用于重下单章；不更新库；返回 `"temp"` 或 `502`。
- **调用方**：无。由 Node 的 redownload 流程取代。

#### `download_img(self, chapter_title, img_array, Error_dict, CF_dict)`（遗留）

- **作用**：逐张下载 `https://dogemanga.com/images/pages/{img_id}?l=zh`，文件名为页码文字；失败计数达到 10 返回 `False`；其他线程遇到 429 时自旋等待；自己遇到 429 时休眠后**从头**递归重下整章；一轮结束后对失败项重试一次；最后 `do_zip_compress` 打包。
- **调用方**：仅 `scrape_each_chapter`、`download_single_chapter`、自身。由 Node 的 `ImageDownloaderService` 与 `ArchiveService` 取代。
- **实现说明**：失败重试循环里请求的是 `target_link`（主循环最后一张图的地址），而不是该失败项的 `link`，这是旧代码的缺陷；因为方法已不可达，不影响现在的行为。

### 14.3 `modules/MangaSite.py`

#### `class MangaSite(metaclass=abc.ABCMeta)`

- **作用**：抓取源抽象基类，声明四个抽象方法：`search_manga(search_name, CF_dict)`、`check_manga_length(CF_dict)`、`generate_chapters_array(start, end, download_root_folder_path, manga_name, CF_dict)`、`scrape_each_chapter(chapter, manga_library, Error_dict, his_length, idx, app, CF_dict)`。
- **调用方**：`DGmanga` 继承它。
- **实现说明**：后两个抽象方法是 Flask 时代的下载接口，迁移后无人调用，但仍强制子类实现。`scrape_cli.py` 实际用到的 `comic_main_page` 不在基类里。

### 14.4 `utils/chapter_title_reformat.py`

#### `chapter_title_reformat(chapterTitle)`

- **作用**：章节名改写的原始实现，规则与 `download/chapter-title.ts` 一一对应（见第 6 节 `download/chapter-title.ts` 的规则表）。文件里有一个注释掉的"`XXX-XXX`"分支（pattern3）和一组注释掉的测试样例。
- **调用方**：`DGmanga.scrape_each_chapter`、`DGmanga.download_single_chapter`（都已不可达）。迁移后 Node 用自己的移植版本。保留它是因为 `DGmanga.py` 在顶部导入它。

### 14.5 `utils/generate_file_path.py`

#### `do_zip_compress(dirpath)`

- **作用**：用 `zipfile`（`ZIP_DEFLATED`）把目录（递归，跳过 `~$` 开头的文件）打成 `<dirpath>.zip`，然后 `shutil.rmtree` 删除目录。
- **调用方**：`DGmanga.download_img`（不可达）。Node 的 `ArchiveService.zipDir` 是它的移植。保留理由同上。

### 14.6 `utils/make_path.py`

#### `path_exists_make(path)`

- **作用**：路径不存在时 `os.makedirs(path, exist_ok=True)`。
- **调用方**：`DGmanga.generate_chapters_array`、`download_single_chapter`、`download_img`（都不可达）。保留理由同上。

---

## 15. 根目录 `Dockerfile`

一个镜像里装 NestJS 后端、Python 抓取器和 Vue 单页应用。从仓库根目录构建：`docker build -t vanmanga .`。基础镜像用 Debian slim 而不是 alpine，注释的理由：`lxml`、`gevent` 只提供 manylinux 的预编译包，alpine 上要从源码编译。

**第 1 段 `frontend-build`**（`node:24.22.1-bookworm-slim`）

1. `WORKDIR /src/frontend`。
2. 先只拷 `frontend/package*.json`，`npm ci`（依赖层可缓存）。
3. 拷入整个 `frontend/`，`npm run build`（`vite build && vue-tsc --noEmit`），产物在 `/src/frontend/dist`。

**第 2 段 `backend-build`**（同一基础镜像）

1. `WORKDIR /src/backend`。
2. 拷 `backend/package*.json`，`npm ci`。
3. 拷 `tsconfig*.json`、`nest-cli.json`、`src/`（不拷 `test/`）。
4. `npm run build`（`nest build`，产物在 `dist/`），再 `npm prune --omit=dev` 去掉开发依赖。

**第 3 段 `runner`**（同一基础镜像）

1. `apt-get install python3 python3-venv tini`（`--no-install-recommends`），清理 apt 列表。
2. 设 `VIRTUAL_ENV=/opt/venv`、把 `/opt/venv/bin` 放到 `PATH` 前面；拷 `requirements-scraper.txt`，建虚拟环境并 `pip install --no-cache-dir`，删掉依赖文件。注释：Debian 的系统 Python 是"外部管理"的，不能直接 pip 安装。因为 `PATH` 优先，`python` 命令就是虚拟环境里的解释器。
3. `WORKDIR /app/backend`。注释：目录结构与仓库一致，后端的相对默认值（`../scrape_cli.py`、`../../../../frontend/dist`）不用改就能解析。
4. 从第 2 段拷 `node_modules`、`dist`；拷 `backend/package.json`；从第 1 段拷 `frontend/dist` 到 `/app/frontend/dist`；拷 `scrape_cli.py`、`modules/`、`utils/` 到 `/app/`。
5. `cd /app && python -B -c "import scrape_cli, modules.DGmanga"`：注释：若缺抓取依赖或 `utils/` 文件就让构建失败（`scrape_cli.py` 只在处理函数里导入 `modules/*`，不显式导入就发现不了）。`-B` 不写 `.pyc`。
6. 环境变量：`NODE_ENV=production`、`PORT=5000`、`PYTHON_EXECUTABLE=python`、`PYTHON_CLI_SCRIPT=/app/scrape_cli.py`、`PYTHON_WORKING_DIR=/app`、`LIBRARY_FILE=/vanmanga/eng_config/manga_library.json`、`THUMBNAILS_DIR=/vanmanga/thumbnails`、`DOWNLOAD_ROOT=/downloaded`。注释：数据路径与 Flask 版容器相同，旧的卷可以原样挂载。`QUEUE_FILE` 未设，默认是 `/vanmanga/eng_config/queue.json`。
7. 建 `/vanmanga/eng_config`、`/vanmanga/thumbnails`、`/downloaded` 并 `chown node:node`。
8. `USER node`：以非 root 运行（旧卷若属 root，可能读不了库文件，此时 `LibraryRepository` 拒绝启动、`TaskQueueService` 把队列文件改名留存——注释里提到的"容器换 uid 后的 `EACCES`"即指此情况）。
9. `EXPOSE 5000`。
10. `HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3`：用 `node -e` 里的 `fetch` 请求 `http://127.0.0.1:${PORT||5000}/api/scraper/sources`，成功状态退出 0，否则 1。这个接口不调用 Python，只验证 HTTP 服务在线。
11. `ENTRYPOINT ["/usr/bin/tini", "--"]`、`CMD ["node", "dist/main.js"]`：`tini` 作为 PID 1 转发信号并回收僵尸进程（每次抓取都会产生 Python 子进程）。

---

## 16. `.github/workflows/ci.yml`

触发：任何分支的 `push`；目标分支为 `staging` 的 `pull_request`。`concurrency`：同一工作流、同一 ref 只保留最新一次运行（`cancel-in-progress: true`）。五个任务互不依赖，并行执行。

**`frontend`（Frontend，`ubuntu-latest`，工作目录 `frontend`）**

1. `actions/checkout@v4`。
2. `actions/setup-node@v4`：版本取 `.nvmrc`（`24.22.1`），npm 缓存按 `frontend/package-lock.json`。
3. `npm ci` → `npm run lint`（`--max-warnings 0`）→ `npm run typecheck`（`vue-tsc --noEmit` 加 e2e 脚本的 `tsc`）→ `npm test`（`vitest run`）→ `npm run build`。

**`backend`（Backend，`ubuntu-latest`，工作目录 `backend`）**

1. 检出；setup-node（`.nvmrc`，缓存键包含前后端两个 lock 文件）。
2. `npm ci` → `npm run lint`（`eslint "{src,test}/**/*.ts" --max-warnings 0`）→ `npm run build` → `npm test`（Jest 单测，`rootDir: src`，匹配 `*.spec.ts`）。
3. "Build frontend for e2e"：在 `frontend` 目录 `npm ci && npm run build`。理由（注释）：e2e 从 `<repo>/frontend/dist` 提供单页应用（`frontend-static.e2e-spec.ts` 需要）。
4. `npm run test:e2e`（`jest --config ./test/jest-e2e.json`，跑第 13 节的四个文件）。

**`e2e`（End-to-end (Playwright)，`ubuntu-24.04`）**

1. 检出；setup-node。
2. 在 `backend` 构建（`npm ci && npm run build`）；在 `frontend` 构建。
3. `npx playwright install --with-deps chromium`。
4. "Smoke test"：在 `frontend` 目录，环境变量 `E2E_BACKEND_MAIN: '1'`，`npm run test:e2e`（`playwright test --project=smoke`）。注释：真实后端（生产入口 `dist/main.js`）同时提供 `frontend/dist`，用 `frontend/e2e/` 里的假抓取器代替 `scrape_cli.py`。
5. 失败时 `actions/upload-artifact@v4` 上传 `frontend/playwright-report` 和 `frontend/test-results`，保留 7 天。

**`scraper`（Python scraper，`ubuntu-latest`）**

1. 检出；`actions/setup-python@v5`：Python `3.11`，pip 缓存按 `requirements-scraper.txt`。
2. `pip install -r requirements-scraper.txt`。
3. `python scrape_cli.py --help`：验证参数解析能跑起来。
4. "Import check"：`python -B -c "import scrape_cli, modules.DGmanga"`。注释：`scrape_cli` 在处理函数内部才导入 `modules/*`，只跑 `--help` 证明不了什么，所以在仓库根目录显式导入抓取器（连同第三方依赖和 `utils/`）。

注意：CI 用 Python 3.11，镜像里用的是 Debian bookworm 自带的 `python3`（bookworm 为 3.11，未在 Dockerfile 中写明版本）。

**`docker`（Docker image，`ubuntu-latest`）**

1. 检出；`docker/setup-buildx-action@v3`。
2. `docker/build-push-action@v6`：上下文 `.`，文件 `Dockerfile`，`push: false`（只构建不推送），缓存用 GitHub Actions 缓存（`cache-from: type=gha`、`cache-to: type=gha,mode=max`）。构建过程本身包含第 15 节第 3 段第 5 步的导入检查。

---

## 17. 读代码时发现的值得注意的行为

以下都是代码的现状，不是建议的修改。

1. **DMCA 路径当前走不到**：Node 侧处理 `errorCode` 504（下载任务删除漫画并广播 `dmca_alert`；调试接口回 451 `dmca`），但 `scrape_cli.py` 和 `modules/DGmanga.py` 从不产生 504。DMCA 页面会被 `check_manga_length` / `comic_main_page` 当成解析失败，报成 501（Cloudflare 拦截），结果是任务静默跳过，漫画保留在库里。
2. **`dmca_alert` 不检查删除是否成功**：`handleDmca` 忽略 `deleteManga` 的返回值，下载目录删不掉、记录保留时也会广播 `dmca_alert`。
3. **图片 429 冷却是全进程共享**：`ImageDownloaderService.cooldownUntil` 在单例上，注释说"同一章节内"，实际同时下载的多个章节也共享。
4. **乱序完成会丢章节**：`NUMBER_OF_WORKERS > 1` 时，较大序号的章节先成功、较小序号的随后失败，`last_epi` 已越过失败章节，之后的整部下载不会补它。
5. **`last_epi` 为 1 时总从第 1 话开始**：`runFullManga` 无法区分"从未下载"与"已下第 1 话"。
6. **`last_epi === chapterCount` 时仍走完整流程**：发 `download_started`/`download_completed`（0 章）并触发 Kavita 扫描；启动扫描不会排入这种情况，手动 `POST /api/download` 会。
7. **空图片列表算成功**：章节页能解析但没有图片时，会生成空 zip 并推进 `last_epi`。
8. **章节名里的空格被 Python 删掉**：`comic_main_page` 的 emoji 字符类里含一个空格。
9. **Cloudflare 求解失败后 `active` 仍为真**：`solveChallenge` 在求解前设置 `active = true`，失败不回滚。
10. **Python 子进程超时只发 `SIGTERM`**：不响应的子进程会让 `run()` 永远不结算。
11. **Kavita 刷新令牌用 `exposeUrl`**：其他 Kavita 请求用 `baseUrl`。
12. **启动扫描与每日扫描可以并行**：没有防重入。
13. **`SchedulerService` 注入了未使用的 `EventsGateway` 和 `ConfigService`**。
14. **生产代码无调用方的方法**：`LibraryRepository.size/snapshot/replaceAll`、`FilesystemService.writeJson`、`ThumbnailService.readThumbnail`、`TaskQueueService.flushPersistence`（单测用）。配置字段 `nodeEnv` 无人读取。
15. **`LibraryService.patch` 的注释与实际调用方不符**：注释说 Kavita 同步和定时任务也用它，实际只有下载编排器用。
16. **`spaFallback` 的边界**：`GET /api`（无结尾斜杠）返回 `index.html`；含 `.` 的前端路由得到 404。
17. **时间精度不统一**：新记录的 `add_date`、`updated_at` 是带小数的秒；下载过程写入的 `updated_at` 是整数秒。
18. ~~**`frontend-static.e2e-spec.ts` 使用默认数据路径**~~：已改为临时目录（与把 e2e 改为经 `createApp` 启动同一批提交）。
