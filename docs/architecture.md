# VanManga 迁移后架构

对应提交：`feature/nestjs-migration-stage-0-1`（Flask + Vue 2 → NestJS 11 + Vue 3.5 迁移完成后）。

相关文档：

- 接口契约：[`api-contract.md`](api-contract.md)
- 前端数据层：[`frontend-data-layer.md`](frontend-data-layer.md)
- 后端迁移审核：[`review/backend-parity.md`](review/backend-parity.md)
- 人工测试清单：[`manual-test-checklist.md`](manual-test-checklist.md)
- 逐方法说明（每个方法做什么、谁调用、复杂实现的解释）：后端与抓取器 [`architecture/backend.md`](architecture/backend.md)，前端 [`architecture/frontend.md`](architecture/frontend.md)

本文是总览，按文件说明每一处代码做什么；具体到每个方法的说明在上面两份逐方法文档里。测试文件（`*.spec.ts`）与被测文件同目录同名，只在第 6 节汇总，不逐个列出。

## 1. 总览

```
浏览器（Vue 3 单页应用）
   │  HTTP  /api/*            （同源；信封 {code,data} / {code,error}）
   │  WS    /socket.io        （服务端只推送，客户端不发消息）
   ▼
NestJS 后端（backend/，一个进程，端口 5000）
   ├─ 提供前端静态文件（frontend/dist）与单页回退
   ├─ 漫画库：manga_library.json（内存 + 原子写盘）
   ├─ 下载队列：queue.json（先进先出，同一时间只跑一个任务）
   ├─ 定时任务：启动扫描、每日 01:30 扫描、每 6 小时 Kavita 同步、Cloudflare 复查
   ├─ 图片下载、打包 zip、封面保存（都在 Node 里做）
   │
   ├──spawn──▶ Python 抓取器 scrape_cli.py（每次调用一个子进程，stdout 输出一行 JSON）
   │              └─ modules/DGmanga.py：只负责解析源站页面
   ├──HTTP───▶ Kavita（可选）：同步系列链接、触发目录扫描、代理登录
   └──HTTP───▶ FlareSolverr（可选）：过 Cloudflare 验证
```

要点：

- **一个镜像、一个进程**：根目录 `Dockerfile` 分三段构建前端、后端，再装入带 Python 虚拟环境的运行镜像。
- **Python 只做解析**：搜索、章节数、章节列表、章节图片地址。下载图片、打包、写库都在 Node。
- **模块之间用事件解耦**：`manga.added`（库 → 下载）、`download.completed`（下载 → Kavita）、`queue.changed`（队列 → Socket 网关）。
- **前端组件不直接碰网络**：组件读 Pinia store；HTTP 只走 `src/api/`；Socket 只在应用根部连一次，事件统一分发到 store。

### 1.1 三条主要流程

**搜索并添加**

1. 前端 `GET /api/scraper/dgmanga/search?q=` → `ScraperService.search` → `DGmangaSource` → `PythonRunnerService` 启动 `scrape_cli.py search`。
2. 结果（含 base64 封面）放进 `SearchCacheService`；返回给前端的封面是一个指向缓存的地址。
3. 前端 `POST /api/library`（只带 `manga_id`、`source`、`submit_sign`）→ `LibraryService.addManga` 从缓存取回完整候选 → 查重 → 存封面 → 写库 → 发 `manga.added`。
4. `DownloadService` 收到事件，把整部下载任务入队。

**下载**

1. `TaskQueueService` 取出任务，交给 `DownloadOrchestratorService`。
2. 取章节数与连载状态 → 取章节列表 → 跳过已下载的章节 → 逐章取图片地址（遇 429 等待重试）→ `ImageDownloaderService` 下载图片 → `ArchiveService` 打包 zip。
3. 每完成一章更新 `last_epi` / `last_epi_name`，推送 `chapter_completed`、`download_progress`。
4. 结束时更新 `completed`、`updated_at`，推送 `download_completed`，发 `download.completed` 事件让 Kavita 扫描该目录。

**删除（受保护）**

1. 前端 `DELETE /api/library/:id`，若服务端设了 `ADMIN_TOKEN` 而请求没带口令 → 401。
2. 前端 `session.withAdmin` 弹口令框，带 `X-Admin-Token` 重试。
3. 后端先查该漫画是否在下载或排队（是则 409 `manga-busy`），再删下载目录、封面、库记录。

### 1.2 磁盘上的数据

| 路径（镜像内默认） | 内容 |
|---|---|
| `/vanmanga/eng_config/manga_library.json` | 漫画库，以 `manga_id` 为键的对象。字段沿用 Flask 版 |
| `/vanmanga/eng_config/queue.json` | 下载队列（正在跑的任务 + 等待的任务） |
| `/vanmanga/thumbnails/<manga_id>.jpg` | 封面 |
| `/downloaded/<名字>$<id>/<名字>/<章节>.zip` | 下载结果。名字里的 `/` 换成 `-` |

## 2. 根目录

| 文件 | 作用 |
|---|---|
| `Dockerfile` | 三段构建：前端 `npm run build`；后端 `npm run build` 后去掉开发依赖；运行段装 Python 虚拟环境和 `requirements-scraper.txt`，拷入 `dist`、`frontend/dist`、`scrape_cli.py`、`modules/`、`utils/`，构建时实际导入一次抓取模块，以 `node` 用户运行，带健康检查 |
| `.dockerignore` | 构建上下文排除项 |
| `.github/workflows/ci.yml` | 五个任务：前端（lint、类型检查、单测、构建）、后端（lint、构建、单测、e2e）、端到端（Playwright，真实后端 + 假抓取器）、Python 抓取器（装依赖、`--help`、导入检查）、镜像构建 |
| `.nvmrc` | Node 版本 `24.22.1` |
| `package.json` | 根脚本：一次构建前后端、启动开发服务 |
| `requirements-scraper.txt` | 抓取器的 Python 依赖（固定版本） |
| `scrape_cli.py` | 抓取器命令行入口，见第 4 节 |
| `README.md` | 部署、环境变量、从 Flask 版升级的步骤（中英文） |
| `LICENSE` | MIT |
| `docs/legacy/` | Flask 版遗留的开发配置，仅存档 |

## 3. 后端 `backend/`

### 3.1 启动与全局设施

| 文件 | 作用 |
|---|---|
| `src/main.ts` | 进程入口。启动前检查 Node 内置的证书信任库里是否还有已被吊销的根证书，有则拒绝启动；用 `createApp()` 建应用，监听端口 |
| `src/bootstrap.ts` | `createApp()`：`NestFactory.create` → `configureApp` → 挂 Swagger（`/api/docs`）。`main.ts`、后端 e2e 测试、前端 Playwright 用的后端（`frontend/e2e/start-backend.cjs`）都经过它，测试装配出的应用与生产完全相同 |
| `src/app.module.ts` | 根模块，装配下面所有模块 |
| `src/app.setup.ts` | `configureApp`：请求体上限 1 MB、全局前缀 `/api`、校验管道、异常过滤器、日志拦截器、可选跨域、单页回退中间件、`frontend/dist` 静态文件 |
| `src/swagger.ts` | 生成 OpenAPI 文档，声明 `X-Admin-Token` 请求头 |
| `src/config/configuration.ts` | 把环境变量读成类型化的 `AppConfig`：存储路径、下载调优、搜索缓存、Kavita、Cloudflare、安全、Python。数值型变量写错会在启动时报出变量名并停止；设了旧的 `LIB_PATH` 而没设 `LIBRARY_FILE` 时告警 |
| `src/config/config.module.ts` | 全局注册配置 |
| `src/common/http/envelope.ts` | `ok(data)`：成功信封 `{code:200,data}` |
| `src/common/http/api-exception.ts` | `ApiException`（带机器可读的 `error` 字符串和可选 `data`）、`MangaNotFoundException`、`UnknownSourceException` |
| `src/common/filters/all-exceptions.filter.ts` | 全局异常过滤器：把任何异常转成失败信封 `{code,error,message?,data?}`，HTTP 状态码等于 `code`；内部细节只进日志，不进响应 |
| `src/common/pipes/validation.pipe.ts` | 全局校验管道（白名单、类型转换），失败为 400 `validation-failed` |
| `src/common/interceptors/logging.interceptor.ts` | 记录每个请求的方法、路径、耗时 |
| `src/common/security/admin-token.guard.ts` | 管理口令守卫。`ADMIN_TOKEN` 为空则放行；否则比对 `X-Admin-Token`（先 SHA-256 再常量时间比较），缺失为 401 `admin-token-required`，错误为 401 `admin-token-invalid` |
| `src/common/security/cors-io.adapter.ts` | Socket.IO 适配器，只允许 `CORS_ORIGINS` 里列出的来源 |
| `src/common/security/trust-store-check.ts` | 找出信任库里仍存在的已吊销根证书（供 `main.ts` 使用） |
| `src/common/http/browser-user-agent.ts` | 直接访问源站时使用的浏览器 User-Agent 常量 |
| `src/common/events/app.events.ts` | 进程内事件名与载荷：`manga.added`、`download.completed`、`queue.changed` |

### 3.2 漫画库 `src/modules/library/`

| 文件 | 作用 |
|---|---|
| `library.controller.ts` | `GET /api/library` 列表；`POST /api/library` 添加（结果映射为 200 / 409 `already-in-library` / 409 `duplicate` / 410 `search-expired`）；`POST /api/library/:id/auto-update` 切换自动更新；`DELETE /api/library/:id`（受口令保护，忙碌时 409 `manga-busy`）；`GET /api/library/:id/thumbnail` 封面 |
| `library.service.ts` | 业务逻辑：`addManga`（缓存取候选 → 查重 → 存封面 → 写库）、`toggleAutoUpdate`、`deleteManga`（删目录、封面、记录；删除进行中时该漫画视为不存在，防止又被入队）、`patch` |
| `library.repository.ts` | `manga_library.json` 的读写。启动时读入内存；文件不存在则新建；读不了或格式不对则抛错让进程退出，不会覆盖原文件；写入先写临时文件再改名，并串行化 |
| `entities/manga.entity.ts` | `Manga` 记录的字段定义（沿用 Flask 版字段：`last_epi`、`download_switch`、`serialization`、`completed`、`add_date`、`updated_at`、`kavita_url` 等） |
| `manga-view.ts` | `toApiManga`：对外输出时把封面统一成相对地址 `/api/library/<id>/thumbnail`（旧记录里存的是带域名或旧路径的地址） |
| `send-thumbnail.ts` | 把封面文件流式返回，文件不存在返回 404 |
| `dto/lean-add-manga.dto.ts` | `POST /api/library` 请求体校验：`manga_id`、`source`、`submit_sign` |
| `dto/add-manga.dto.ts` | 服务层入参与查重结果的类型 |
| `services/duplicate-check.service.ts` | 相似标题查重：归一化后按二元组 Dice 系数比较，返回最相近的几个库内标题 |
| `services/manga-factory.service.ts` | 由搜索候选生成一条新的 `Manga` 记录（默认值与 Flask 版一致） |
| `library.module.ts` | 模块装配 |

### 3.3 抓取 `src/modules/scraper/` 与搜索缓存

| 文件 | 作用 |
|---|---|
| `scraper.controller.ts` | `GET /api/scraper/sources`；`GET /api/scraper/:source/search?q=`；`GET /api/scraper/:source/search-thumbnail/:mangaId`（从搜索缓存取封面）；调试用的 `metadata`、`chapters`、`chapter-images` |
| `scraper.service.ts` | 抓取的唯一入口。搜索后丢弃 id 不安全的候选（含路径分隔符、控制字符，或为空、`.`、`..`），并把候选写入搜索缓存 |
| `scrape-errors.ts` | 把抓取器返回的错误码和子进程失败映射成统一的接口错误（如 502 `scraper-failed`） |
| `interfaces/manga-source.interface.ts` | 抓取源接口 `IMangaSource`：`search`、`getMetadata`、`getChapters`、`getChapterImages` |
| `sources/dgmanga.source.ts` | DogeManga 源：每个方法调用一次 `scrape_cli.py` 的对应子命令 |
| `sources/source-registry.service.ts` | 按名字登记和查找抓取源；未登记返回 404 `unknown-source` |
| `python/python-runner.service.ts` | 启动 Python 子进程：参数前加 `--` 防止以 `-` 开头的 id 被当成选项；通过 stdin 传入当前 Cloudflare 状态；带超时；解析 stdout 的单行 JSON |
| `python/python-runner.types.ts` | 子进程结果与错误的类型 |
| `python/__fixtures__/fake-cli.cjs` | 单测和后端 e2e 用的假抓取器 |
| `dto/*.ts` | 搜索结果、章节、章节数与连载状态、章节图片地址的类型 |
| `scraper.module.ts` | 模块装配；注释里写了新增抓取源的步骤 |
| `../search-cache/search-cache.service.ts` | 内存里的搜索候选缓存，键为 `source:manga_id`，有过期时间和条数上限（先进先出） |
| `../search-cache/search-cache.module.ts` | 全局模块，抓取和漫画库都用它 |

### 3.4 下载 `src/modules/download/`

| 文件 | 作用 |
|---|---|
| `download.controller.ts` | `POST /api/download` 整部下载；`POST /api/download/chapters` 重下指定章节；`POST /api/library/rezip` 重新打包（受口令保护）；`GET /api/download/queue` 队列快照；`GET /api/download/current` 当前任务；`GET /api/library/:id/chapters` 从源站取章节列表 |
| `download.service.ts` | 对控制器的门面：校验漫画存在后入队；监听 `manga.added` 自动入队 |
| `download-orchestrator.service.ts` | 单个任务的完整流程。整部下载：取元数据 → 章节列表 → 跳过已下载 → 下载 → 更新记录；重下：只处理选中的章节；重新打包：遍历下载目录。还负责：章节页 429 的等待重试、章节之间 2–5 秒的间隔、失败图片过多的章节整章放弃并删掉半成品目录、下架（DMCA，抓取器返回 504）时删除漫画并推送 `dmca_alert`——注意当前 Python 抓取器从不返回 504，下架页面会表现为 501，所以这条路径目前实际走不到、章节名清理（为空或为 `.`/`..` 时回退成"第N话"）、任务开始与结束的 Socket 推送 |
| `image-downloader.service.ts` | 下载一个章节的全部图片：可配置并发、每张之间的礼貌延迟、遇 429 时统一退避（冷却时间挂在单例服务上，整个进程内所有正在下载的章节共用）、长章节定时输出进度日志 |
| `chapter-title.ts` | 章节名改写规则，逐条对应旧的 `utils/chapter_title_reformat.py`（如 `第68-69话` → `第68-第69话`、`v2` → `v$2`），保证新旧压缩包命名一致，Kavita 才能正确解析 |
| `queue/task-queue.service.ts` | 先进先出、并发为 1 的任务队列。入队去重（同一漫画的同类任务合并，重下任务合并章节）；每次变化写 `queue.json` 并发 `queue.changed`；启动时同步恢复队列，逐项校验，读不了或格式不对的文件改名留存。执行器由下载编排器在 `onApplicationBootstrap` 里登记，所以恢复的任务要等漫画库读入之后才开始 |
| `queue/task.types.ts` | 任务种类（整部、重下、重新打包）、载荷、队列快照、对外的任务摘要 |
| `dto/submit-download.dto.ts` | 两个下载接口的请求体校验 |
| `__fixtures__/chapter-title-reformat.json` | 章节名改写的对照样例（由旧 Python 实现生成） |
| `download.module.ts` | 模块装配 |

### 3.5 文件系统 `src/modules/filesystem/`

| 文件 | 作用 |
|---|---|
| `filesystem.service.ts` | 建目录、读写文件、列目录、删除；`ensureMangaTree` 建出漫画的两层目录；`chapterDir` 拒绝任何不是漫画目录直接子项的章节名 |
| `manga-path.ts` | 目录命名规则：名字里的 `/` 换成 `-`；顶层目录为 `<名字>$<id>`。下载、删除、Kavita 扫描都用它，保证一致 |
| `archive.service.ts` | 把章节目录打成 zip 后删除目录；`rezipDownloadRoot` 遍历整个下载目录，把残留的章节目录补打包 |
| `thumbnail.service.ts` | 封面：把 base64 存成 `<id>.jpg`、读取、删除；拒绝会逃出封面目录的 id |
| `filesystem.module.ts` | 模块装配 |

### 3.6 实时推送 `src/modules/events/`

| 文件 | 作用 |
|---|---|
| `events.gateway.ts` | Socket.IO 网关。只向客户端广播七个事件：`download_started`、`chapter_completed`、`download_progress`、`download_completed`、`queue_updated`、`scan_completed`、`dmca_alert`；监听进程内的 `queue.changed` 转发为 `queue_updated` |
| `events.types.ts` | 七个事件的名字常量与载荷类型 |
| `events.module.ts` | 模块装配 |

### 3.7 定时任务 `src/modules/scheduler/`

| 文件 | 作用 |
|---|---|
| `scheduler.service.ts` | 启动时：后台做一次 Kavita 同步，再做启动扫描。启动扫描：先探测 Cloudflare，再倒序遍历库——首次下载没完成的入队；已下完且自动更新关闭（`download_switch` 为 1）的跳过；其余的问源站章节数，多于 `last_epi` 才入队；每次向源站查询章节数之后等 1 秒（直接入队或跳过的不等）；扫描期间被删除的漫画跳过，任何错误都不会让进程退出。定时：每天 01:30 扫描；每 6 小时 Kavita 同步；检测到 Cloudflare 验证时注册一个每 12 分钟的复查，验证消失后注销 |
| `scheduler.module.ts` | 模块装配 |

### 3.8 外部服务

| 文件 | 作用 |
|---|---|
| `src/modules/kavita/kavita.service.ts` | 用管理员 API Key 换取令牌；`syncLibrary` 拉取 Kavita 系列并把匹配的 `kavita_url` 写进库；`scanFolder` 让 Kavita 扫描某部漫画的目录；监听 `download.completed` 自动扫描；代理用户登录与刷新令牌 |
| `src/modules/kavita/kavita.controller.ts` | `POST /api/kavita/login`、`POST /api/kavita/refreshtoken`。未配置 Kavita 时 404 `kavita-disabled`；账号被拒为 403 `kavita-login-failed`；连不上为 502 `kavita-unreachable`（上游错误细节只进日志） |
| `src/modules/kavita/kavita.module.ts` | 模块装配（带 HTTP 超时） |
| `src/modules/cloudflare/cloudflare.service.ts` | 判断响应是否为 Cloudflare 验证页；通过 FlareSolverr 求解并保存 cookie 与 User-Agent；`buildHeaders` 给后续请求使用 |
| `src/modules/cloudflare/cloudflare.types.ts` | Cloudflare 状态与 FlareSolverr 响应的类型 |
| `src/modules/cloudflare/cloudflare.module.ts` | 模块装配 |

### 3.9 前端托管 `src/modules/frontend/`

| 文件 | 作用 |
|---|---|
| `frontend.module.ts` | `frontend/dist` 的路径（`STATIC_ROOT`）和 `GET /api/config`。静态文件由 `configureApp` 里的 `app.useStaticAssets` 提供（不自动返回 `index.html`，找不到文件时得到 404） |
| `spa-fallback.ts` | 中间件：对不带扩展名、且不是 `/api` 或 `/socket.io` 的 GET/HEAD 请求返回 `index.html`，让前端路由生效，同时不遮住静态资源 |
| `frontend.controller.ts` | `GET /api/config`：返回 `kavitaEnabled`、`kavitaExposeUrl`、`adminRequired` |

### 3.10 后端测试

| 文件 | 作用 |
|---|---|
| `src/**/*.spec.ts`（27 个） | 各服务、控制器、守卫、过滤器的单元测试 |
| `test/api-contract.e2e-spec.ts` | 启动完整应用（假抓取器），逐项核对接口契约：信封、状态码、错误字符串、口令保护、已删除的旧接口确实返回 404 |
| `test/cors.e2e-spec.ts` | 默认不带跨域头；设了 `CORS_ORIGINS` 后只放行列出的来源 |
| `test/frontend-static.e2e-spec.ts` | 静态文件、单页回退、`index.html` 可访问；不存在的资源和 `/js/config.js` 是 404 |
| `test/queue-restore.e2e-spec.ts` | 预置库文件和 `queue.json` 后启动：恢复的任务按顺序、在启动扫描的任务之前执行，库里已没有的漫画被跳过 |
| `test/jest-e2e.json` | e2e 的 Jest 配置 |

## 4. Python 抓取器

| 文件 | 作用 |
|---|---|
| `scrape_cli.py` | 命令行入口：`--source <源> <子命令> -- <参数>`。子命令 `search`、`metadata`、`chapters`、`chapter-images`。从 stdin 读 Cloudflare 状态，调用对应源的方法，在 stdout 输出一行 JSON（日志走 stderr）。文件内的 `SOURCE_REGISTRY` 是新增源时唯一要改的地方 |
| `modules/MangaSite.py` | 抓取源的抽象基类 |
| `modules/DGmanga.py` | DogeManga 的页面解析：搜索、章节数与连载状态、章节列表、章节图片地址。文件里旧的下载图片方法仍在，但迁移后不再被调用（下载由 Node 完成） |
| `utils/chapter_title_reformat.py` | 章节名改写的原始实现（`DGmanga.py` 仍引用；Node 侧的 `chapter-title.ts` 是它的移植） |
| `utils/generate_file_path.py`、`utils/make_path.py` | `DGmanga.py` 顶部引用的打包与建目录工具，只为保证模块能导入 |

## 5. 前端 `frontend/`

### 5.1 工程配置

| 文件 | 作用 |
|---|---|
| `index.html` | 入口页，`<html class="dark">` 固定深色，`#app` 带 `isolate` |
| `vite.config.ts` | Vite 配置：Vue 插件、Nuxt UI 插件、`@` 别名、开发时把 `/api` 和 `/socket.io` 代理到后端 |
| `ui.options.ts` | Nuxt UI 选项（主色 violet、中性色、胶囊形按钮和输入框），构建和组件测试共用 |
| `vitest.config.ts` | 单测配置（jsdom） |
| `playwright.config.ts` | 端到端配置：启动真实后端、串行、不重试；两个项目——冒烟（进 CI）和截图（不进 CI） |
| `tsconfig.json`、`tsconfig.e2e.json` | 应用与 e2e 脚本的类型检查 |
| `eslint.config.js` | lint 规则 |
| `public/favicon.ico` | 沿用旧版的网站图标 |
| `src/assets/main.css` | 唯一定义颜色的地方：八个调色板值、蓝到紫渐变、把调色板映射到 Nuxt UI 的设计变量、渐变的四处用法 |
| `src/assets/valiya-mark.png`、`valiya-logo.png` | Valiya 星形图标（白色）与完整字样标志，均取自旧前端原图 |

### 5.2 应用骨架

| 文件 | 作用 |
|---|---|
| `src/main.ts` | 创建应用，安装 Pinia、路由、Nuxt UI |
| `src/App.vue` | 根组件：调用 `useRealtime()`，渲染 `<UApp>` 与外壳 |
| `src/router/index.ts` | 路由：`/` 漫画库、`/settings` 设置；旧地址 `/mainpage/*` 重定向到 `/` |
| `src/layouts/AppShell.vue` | 外壳：顶栏（标志、搜索框、队列按钮、设置入口）、手机底部三个标签（漫画库、队列、设置）、实时连接断开提示；挂载所有浮层（搜索面板、队列抽屉、章节选择、确认框、口令框）；把服务端事件转成提示：下架、下载失败、重新打包完成（下载成功不提示） |

### 5.3 接口层 `src/api/`

| 文件 | 作用 |
|---|---|
| `types.ts` | 与接口契约一一对应的类型：信封、全部错误码、`Manga`、搜索候选、章节、队列与任务摘要、运行时配置、七个 Socket 事件的载荷 |
| `http.ts` | 唯一的 axios 实例（同源 `/api`，60 秒超时）。`request` 解开信封；任何失败都转成 `ApiError`；带 `adminProtected` 标记的请求自动附上 `X-Admin-Token` |
| `errors.ts` | `ApiError`（`status`、`error`、`message`、`data`）及判断：口令错误、搜索过期、请求被取消 |
| `endpoints.ts` | 每个接口一个带类型的函数：配置、抓取源、搜索、库的增删改、章节列表、下载、重新打包、队列、Kavita 登录 |
| `manga.ts` | 对 `Manga` 的两个读取：`mangaUpdatedAt`（旧记录没有 `updated_at` 时用 `add_date`）、`isAutoUpdate`（`download_switch === 0` 表示开启） |
| `index.ts` | 统一导出（目前没有代码从它导入，各处直接引用具体文件） |

### 5.4 状态 `src/stores/`

| 文件 | 作用 |
|---|---|
| `library.ts` | 漫画库：`items`、按更新时间排序的 `sorted`、按 `filter` 过滤的 `visible`；`load`（并发安全，只应用最新一次，且不会覆盖加载期间的本地改动）；`add`（返回 `added` / `cancelled` / `already-in-library` / `search-expired`，相似标题时回调询问）；`toggleAutoUpdate`、`fetchChapters`、`redownload`、`remove`、`rezip`；处理 Socket 推来的记录更新与下架 |
| `queue.ts` | 下载队列：`active`、`pending`、`count`、各漫画的章节进度、`isMangaBusy`、`progressOf`；`load` 与 `queue_updated` 的先后关系处理；记录最近一次下载完成与重新打包完成 |
| `config.ts` | `GET /api/config` 的结果；加载失败不抛错，记在 `error` 里 |
| `session.ts` | 管理口令（只在内存）与 `withAdmin`（遇 401 弹口令框并重试，取消则静默中止）；Kavita 登录、退出，登录链接存在 localStorage `vanmanga.kavita` |
| `realtime.ts` | Socket 连接状态：`connected`、`everConnected`、`offline`（用于显示断线提示） |
| `ui.ts` | 浮层开关：搜索面板、队列抽屉、当前打开章节选择的漫画；`confirm()` 返回 Promise 的全局确认框 |

### 5.5 Socket 与组合函数

| 文件 | 作用 |
|---|---|
| `src/composables/useSocket.ts` | 全应用共用的一条 socket.io 连接（同源、手动连接、引用计数） |
| `src/socket/dispatcher.ts` | `bindSocketEvents`：把七个服务端事件和连接生命周期事件分发到各 store；每次（重新）连接后重新加载库和队列，补上断线期间错过的变化 |
| `src/composables/useRealtime.ts` | 根组件调用一次：先经 HTTP 加载配置、库、队列，再连接 socket 并绑定分发器 |
| `src/composables/useMangaSearch.ts` | 搜索状态（`query`、`results`、`loading`、`error`、`lastQuery`）与 `search`、`research`、`cancel`；新搜索会中止旧搜索，迟到的旧响应被忽略 |
| `src/composables/useMangaActions.ts` | 每部漫画的四个操作及其提示：切换自动更新、打开章节选择、在 Kavita 中打开（只开 http/https 链接）、删除（确认 → 口令）。卡片和列表行共用 |
| `src/composables/useMangaStatus.ts` | 某部漫画在队列中的状态：空闲、下载中（带进度）、排队中（带位次） |
| `src/composables/useRelativeTime.ts` | 中文相对时间（刚刚、N 分钟前、N 小时前、昨天、N 天前、上周、日期），全应用共用一个每分钟跳动的时钟 |
| `src/composables/useLibraryViewMode.ts` | 卡片 / 列表的选择，记在 localStorage `vanmanga.libraryView` |
| `src/composables/useIsMobile.ts` | 是否为手机布局（宽度小于 768px） |
| `src/errors/messages.ts` | 错误码到中文提示的唯一映射；被取消的请求返回空串（不显示） |
| `src/utils/open-external.ts` | 只打开 http/https 的外部链接，带 `noopener,noreferrer` |

### 5.6 页面与组件

| 文件 | 作用 |
|---|---|
| `src/views/LibraryView.vue` | 漫画库页：工具行、卡片网格或列表、首次加载骨架、加载失败与重试、空库提示、筛选无结果提示 |
| `src/views/SettingsView.vue` | 设置页：Kavita 三种状态（未启用、未登录表单、已登录）、"重新打包全部漫画"（确认 → 口令）、关于（Valiya 标志） |
| `src/components/brand/BrandLogo.vue` | 顶栏标志：白色星形图标 + 白色 "Van" + 渐变 "Manga" |
| `src/components/library/LibraryToolbar.vue` | "共 N 部 · 按最近更新"、库内筛选框、卡片 / 列表切换 |
| `src/components/library/MangaCard.vue` | 封面卡片：封面、"新"标记、"自动"标记、下载中进度或排队位次、标题、最新章节或"尚未下载"、相对更新时间、操作菜单 |
| `src/components/library/MangaRow.vue` | 列表行：小封面、标题、作者与最新章节或进度、更新时间、自动 / 手动标记、操作菜单 |
| `src/components/library/MangaActionsMenu.vue` | ⋯ 菜单：自动更新开关、选择章节重新下载、在 Kavita 中打开、删除；忙碌时禁用重下和删除并说明原因 |
| `src/components/library/CoverImage.vue` | 懒加载封面；加载失败显示占位底色和标题首字 |
| `src/components/library/manga-display.ts` | "新"的判定：三天内有更新 |
| `src/components/search/SearchPanel.vue` | 搜索并添加面板：桌面贴在顶栏下方、手机全屏；搜索中、结果、无结果、出错与重试；添加的四种结果（成功、相似标题确认、已在库中、搜索过期后一键重搜） |
| `src/components/search/SearchResultRow.vue` | 搜索结果的一行：封面、标题、作者与最新章节、"添加"或"已在库中" |
| `src/components/queue/QueueDrawer.vue` | 队列容器：桌面右侧抽屉、手机全屏 |
| `src/components/queue/QueueContent.vue` | 队列内容（只读）：正在下载（"已完成 x / y 话"与进度条）、等待列表、空状态、连接状态 |
| `src/components/chapters/ChapterPickerDialog.vue` | 章节选择弹窗：加载章节、点选、全选、反选、"重新下载 n 话" |
| `src/components/common/AdminTokenDialog.vue` | 管理口令输入框：确认后交给 `withAdmin` 重试；口令错误时在框内提示并可重输；取消则静默中止 |
| `src/components/common/ConfirmDialog.vue` | 全局确认框，由 `ui.confirm()` 驱动 |
| `src/components/common/ProgressBar.vue` | 渐变进度条；总数未知时为不确定状态 |

## 6. 前端测试与端到端

| 文件 | 作用 |
|---|---|
| `src/**/*.spec.ts`（26 个） | 接口层、store、分发器、组合函数、各组件与两个页面的单元测试 |
| `src/test/fake-server.ts` | 测试替身：替换 axios 的传输层，真实的实例、拦截器和接口函数照常运行；支持延迟应答以模拟并发 |
| `src/test/fixtures.ts` | 生成测试用的 `Manga` 与搜索候选 |
| `src/test/mount.ts` | 在 `<UApp>` 里挂载组件，并提供在整个文档里找文字、找按钮、点击的辅助函数 |
| `e2e/start-backend.cjs` | 启动真实后端（`backend/dist`，同时托管 `frontend/dist`），使用临时数据目录和假抓取器；CI 中走生产入口 `dist/main.js`，本地用同一个 `createApp()`（只跳过信任库检查） |
| `e2e/fake-scraper.cjs` | 假的 `scrape_cli.py`：固定返回几部候选，其中一部会"慢慢下载"，供截图展示进度和排队 |
| `e2e/smoke.e2e.ts` | 冒烟用例（进 CI）：搜索 → 添加 → 库里出现 → 删除时先输错口令再输对 → 库里消失；同时检查 375px 宽度下不出现横向滚动、控制台没有意外报错 |
| `e2e/screenshots.e2e.ts` | 生成评审截图到 `docs/review/p3b-screenshots/`（不进 CI） |
| `e2e/constants.ts` | 端到端共用的管理口令常量 |

## 7. 已知的限制

- `GET /api/download/queue` 不返回进度，页面刷新后要等下一条 `download_progress` 才有数字。
- 接口没有"正在下载哪一话"的字段，队列里只显示已完成的章节数。
- Kavita 登录链接（含长期有效的 API Key）存在浏览器本地，存储方式待重新设计。
- Socket.IO 的 WebSocket 通道不受跨域设置限制，其他网页可以连上并读到只读的进度广播。
- 前端主 JS 文件约 572 kB，未做拆分。
- 下架（DMCA）处理在后端和前端都已实现，但当前抓取器从不返回对应的 504 错误码，这条路径实际不会触发。
- `modules/DGmanga.py` 里的 `generate_chapters_array`、`scrape_each_chapter`、`download_single_chapter`、`download_img` 迁移后不再被调用，但因抽象基类和顶部导入的关系不能直接删除。
