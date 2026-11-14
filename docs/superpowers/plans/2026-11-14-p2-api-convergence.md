# P2 · 接口收敛与后端加固 — 实现计划

- 规格：`docs/superpowers/specs/2026-11-14-migration-completion-roadmap-design.md` 第 6 节
- 契约：`docs/api-contract.md`（已先行提交；实现中如需改动，与代码同一提交更新）
- 审核：`docs/review/backend-parity.md`（F7、F9、F10、F13、F21、F30、F31）
- 基线：`6fcfbb0`
- 每个任务：先写失败的测试 → 实现 → `npx jest`、`npm run lint`、`npm run build` 通过 → 单独提交。

已知基线失败：`src/common/security/trust-store-check.spec.ts`（本机 Node 低于 `.nvmrc`），忽略。

## 架构要点

- 规范路由与旧路由拆成不同控制器：`*.controller.ts`（规范）与 `*-legacy.controller.ts`（`/api/dogemanga/*`，P4 整个删除）。两者共用 service。
- 失败统一抛 `ApiException(status, error, { message?, data? })`；共享 service 抛的 Nest 异常带 `errorCode` 属性（`MangaNotFoundException`、`UnknownSourceException`），`getResponse()` 与原来一致，旧路由看到的形状不变。
- 全局过滤器按路径分支：`/api/dogemanga/*` 输出旧结构 `{ statusCode, timestamp, path, message }`，其余输出 `{ code, error, message?, data? }`。
- 规范读接口经 `toApiManga()` 归一（封面相对路径、`updated_at` 缺省 `add_date`、`source` 缺省、`kavita_url: 'None'` → null）。旧路由返回原始记录。
- `main.ts` 与 e2e 共用 `configureApp(app)`（`src/app.setup.ts`）和 `buildSwaggerDocument(app)`，避免两套启动配置。

## 任务

### T1 旧路由特征测试（锁住现状）

- 新建 `backend/src/modules/legacy-contract.spec.ts`：用 Nest testing 起 Library/Download/Scraper 旧控制器（service 用桩），断言 `dogemanga/lib`、`confirm`（added / duplicate 409-in-body / exists / expired）、`deletemanga`（成功、busy → HTTP 409 + `message:{data:false,code:434}`）、`downloadswitch`、`cdl`、`dlqueue`、`rezip`（GET）、`confirmmanga`、`search`（456 / 457 / 200）的当前状态码与响应体。
- 测试在现有代码上直接通过；之后每个任务都必须保持通过。

### T2 统一错误信封

- `backend/src/common/http/api-exception.ts`：`ApiException`、`errorCodeOf()`、`MangaNotFoundException`、`UnknownSourceException`。
- `backend/src/common/filters/all-exceptions.filter.ts`：按路径分支；状态 → 默认 error 映射（400 `validation-failed`（ValidationPipe 数组消息）/`bad-request`，404 `not-found`，500 `internal-error`，其余 `http-<status>`）。
- 测试 `all-exceptions.filter.spec.ts`：规范路径各分支、旧路径结构不变、非 HttpException → 500。
- `LibraryService.get/deleteManga`、`SourceRegistryService.get` 改抛带 errorCode 的子类（消息不变）。

### T3 `configureApp` + Swagger 工厂

- `backend/src/app.setup.ts`：body parser、CORS、全局前缀、ValidationPipe、过滤器、拦截器、SPA fallback。
- `backend/src/swagger.ts`：`buildSwaggerDocument(app)`；`main.ts` 改用两者。
- `test/frontend-static.e2e-spec.ts` 改用 `configureApp`。

### T4 `updated_at` 与读归一（F7、F13）

- `entities/manga.entity.ts` 加 `updated_at?: number`。
- `backend/src/modules/library/manga-view.ts`：`ApiManga` 类型、`toApiManga()`、`thumbnailPath(id)`。测试 `manga-view.spec.ts`：绝对地址/旧 `dogemanga/thumbnail?mid=` 归一、`updated_at` 缺省、`kavita_url` 'None' → null、`source` 缺省。
- `MangaFactoryService.build`：`updated_at = add_date`。
- `ThumbnailService.persistAndLink` 写相对路径，不再拼 `MANGA_BASE_WEBSOCKET_URL`；`.env.example` 注释更新。

### T5 规范漫画库控制器

- 拆出 `library-legacy.controller.ts`（原 `dogemanga/*` 处理器原样搬移）；`library.controller.ts` 只留规范路由，按契约：`@HttpCode(200)`、`toApiManga`、`ApiException`。
- `dto/lean-add-manga.dto.ts`：`manga_id`、`source`（必填）、`submit_sign`。
- `POST /api/library`：`{status:'added', manga}` / `{status:'cancelled'}`；409 `already-in-library`（附 manga）、409 `duplicate`（附 duplicates）、410 `search-expired`。
- `DELETE`：404 / 409 `manga-busy` / 500 `delete-failed`；`auto-update` 404。
- 测试 `library.controller.spec.ts`（HTTP 级，生产 ValidationPipe + 过滤器）。

### T6 规范下载控制器 + 章节路径参数（F31 前半）

- 拆出 `download-legacy.controller.ts`；`download.controller.ts` 规范路由：`POST /download`、`POST /download/chapters`、`POST /library/rezip`、`GET /download/queue`（`QueueSnapshot`）、`GET /download/current`（`TaskSummary|null`）、`GET /library/:mangaId/chapters`（读路径参数，返回 `Chapter[]`，501 → 502 `scraper-blocked`，504 → 451 `dmca`，抓取异常 → 502 `scraper-failed`）。
- `TaskQueueService.snapshot()`。
- 测试 `download.controller.spec.ts`。

### T7 规范搜索与抓取接口（F31 后半）

- `scraper.controller.ts`：所有响应入信封；search 恒返回封面 URL，去掉 `?thumb`；空 q → 400 `query-required`；源返回 457（无结果）→ `[]`；其他 runner 错误 → 502 `scraper-failed`；metadata/chapters/chapter-images 的 errorCode 映射（`scraper-result.ts` 辅助函数）。
- 测试 `scraper.controller.spec.ts`。

### T8 Kavita 规范错误 + 启动不挂起（F21）

- `kavita.controller.ts`：login/refreshtoken 用 `ApiException`（404 `kavita-disabled`，上游 400/401 → 403，其它 → 502 `kavita-unreachable`），`status` 保持旧形状（现有前端在用）。
- `scheduler.service.ts`：启动时 Kavita 同步改为后台执行，不阻塞 `onModuleInit`（HTTP 已有 15s 超时）。
- 测试：更新 `kavita.controller.spec.ts`；`scheduler.service.spec.ts` 加"同步永不返回时 onModuleInit 仍立即完成"。

### T9 `GET /api/config` + 管理员口令

- `configuration.ts`：`security.adminToken`（`ADMIN_TOKEN`）。
- `backend/src/common/security/admin-token.guard.ts`：sha256 后 `timingSafeEqual`；401 `admin-token-required` / `admin-token-invalid`。
- 守卫加到规范 `DELETE /library/:id`、`POST /library/rezip`，以及旧的 `deletemanga`、`rezip`（否则可绕过）。
- `FrontendController` 加 `GET /api/config`（`frontend` 模块已有配置注入）。
- 测试：`admin-token.guard.spec.ts`、`frontend.controller.spec.ts`、`configuration.spec.ts`。

### T10 下载队列持久化与去重

- `configuration.ts`：`storage.queueFile`（`QUEUE_FILE`，缺省为库文件同目录 `queue.json`）。
- `task-queue.service.ts`：构造注入 ConfigService、EventEmitter2；`onModuleInit` 同步读取恢复（运行中任务回到队首，其余按原顺序；文件损坏则告警并以空队列启动）；入队/开始/结束时串行原子写（tmp + rename）；去重（契约 3.4）；每次变化发内部事件 `QUEUE_CHANGED`（载荷 `QueueSnapshot`）。
- 重跑核对：全量任务从 `last_epi + 1` 开始（`download-orchestrator.service.ts` `runFullManga`），无需额外跳过逻辑。
- 测试：重写 `task-queue.service.spec.ts`（临时目录）。

### T11 新 Socket 事件 + `updated_at` 写入 + 章节间隔（F7、F10、F30）

- `events.types.ts`/`events.gateway.ts`：七个新事件及载荷；`@OnEvent(QUEUE_CHANGED)` → `queue_updated`。旧事件照发。
- `download-orchestrator.service.ts`：`download_started`、`download_progress`、`chapter_completed`、`download_completed`（含失败分支与异常分支）；最新话推进、下载完成时写 `updated_at`；章节启动间隔 2–5 秒（首章除外）。
- 测试：`events.gateway.spec.ts`、`download-orchestrator.service.spec.ts`（事件顺序、`updated_at` 写入、`add_date` 不变、间隔）。

### T12 e2e：搜索 → 添加 → 查库 → 删除

- 扩展 `src/modules/scraper/python/__fixtures__/fake-cli.cjs`：`search`、`metadata`、`chapters`。
- `test/api-contract.e2e-spec.ts`：临时目录 + 环境变量，动态导入 `AppModule`，`configureApp`；走 search（含空结果）→ add（含 duplicate / already-in-library）→ 等队列空 → library（`updated_at`、相对封面）→ delete（带/不带口令）→ 再查库；`GET /api/config`；Swagger 文档包含每个规范路由且受保护路由声明 `X-Admin-Token`。

### T13 Swagger 装饰器与文档收尾

- 各规范控制器 `@ApiTags`、`@ApiOperation`，受保护路由 `@ApiHeader`、旧路由 `deprecated: true`；规范 DTO `@ApiProperty`。
- `docs/review/backend-parity.md` 回填 P2 处理结果；`.env.example` 加 `ADMIN_TOKEN`、`QUEUE_FILE`。
