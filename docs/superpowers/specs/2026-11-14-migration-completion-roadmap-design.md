# VanManga 迁移收尾路线图 — 设计文档

- 日期：2026-11-14
- 分支：`feature/nestjs-migration-stage-0-1`
- 状态：设计已逐节确认，待评审
- 取代：`2026-06-06-frontend-vue3-rewrite-unified-build-design.md` 中关于页面重写的部分（第 8、10 节），以及 Plan 2a/2b 的后续计划

## 1. 背景

后端已由 Allen 迁移到 NestJS（Stage 0–7 完成），单镜像 Docker 已就绪。前端 `frontend/`（Vue 3.5）完成了外壳和数据层，搜索、漫画库、Kavita 三个页面仍是占位。仓库里 Flask 程序和 Vue 2 源码仍在。

本文档定义把迁移做完并整体优化所需的五个项目、它们的顺序和各自范围。每个项目各自走"实现计划 → 执行"；P3 开工前另做一轮带效果图的详细设计。

## 2. 已确认的决策

| 决策点 | 结论 |
|---|---|
| 前端调用的接口 | 只调新规范接口；页面完成后删除后端 `/api/dogemanga/*` |
| 前端框架 | Vue 3（已是），Vue 2 源码仅作蓝本，最后删除 |
| 界面 | 重新设计，不还原旧外观 |
| UI 库 | Nuxt UI + Tailwind，单套响应式；移除 element-plus 和 vant |
| 整体布局 | 漫画库为主页，顶栏搜索添加，右侧队列抽屉，无侧边栏 |
| 主页内容 | 封面卡片按最近更新排序，卡片显示最新话名和更新时间，可切列表视图 |
| 推进顺序 | P0 → P1 → P2 → P3 → P4，后端先定稿，前端后做 |
| 后端审核人 | Claude 对照审核，清单交用户和 Allen 确认 |

## 3. 现状中已发现的问题

审核（P1）会系统化补全，这里是设计阶段深搜已确认的：

- 前端类型把 `manga_id` 写成 `number`，后端全是 `string`
- 业务失败的返回方式混用：多数 HTTP 200 + `code`，删除冲突却抛 409，前端靠拦截器补丁兜底
- `GET /api/scraper/:source/search` 返回裸数组，无信封
- `GET /api/library/:mangaId/chapters` 读的是 query 参数 `manga_id`，路径参数被忽略，新路由不可用
- 前端自动登录用 `MANGA_BASE_URL` 拼 Kavita 登录地址，未使用后端返回的 `loginUrl`
- 封面 URL 把域名写进 `manga_library.json`
- 删除漫画、全盘重新打包无任何校验
- 下载队列只在内存，重启即丢
- 无 CI；前端无 lint；两套 UI 库全量注册，包体 1.25 MB
- Kavita 登录、同步、扫描仅有单测，未对真实服务验证

## 4. P0 · CI 与代码规范

一个 GitHub Actions 工作流，推送和向 `staging` 提 PR 时触发，四个并行任务：

| 任务 | 步骤 |
|---|---|
| 前端 | `npm ci` → ESLint → `vue-tsc` → Vitest → 构建 |
| 后端 | `npm ci` → ESLint → 构建 → Jest → e2e |
| Python 抓取器 | 安装 `requirements-scraper.txt` → 运行 `scrape_cli.py --help` 确认可导入 |
| 镜像 | 用 `backend/Dockerfile` 构建，不推送 |

- Node 版本读 `.nvmrc`
- 前端新增 ESLint（Vue 3 + TypeScript 规则）；后端已有 `lint` 脚本，缺配置文件则补
- 接入时现有代码的 lint 报错在 P0 内修完，不留豁免

完成标准：工作流在当前分支全绿。

## 5. P1 · 后端迁移审核

以 Flask 原版（`main.py`、`utils/`、`modules/`）为基准，逐项对照 NestJS 实现。

对照的六个面：

1. HTTP 路由：每个 Flask Resource 的入参、返回码、返回体
2. Socket 事件：事件名、载荷、触发时机
3. 定时任务：每日扫描、启动扫描、Kavita 同步、Cloudflare 监控
4. 下载流水线：章节命名、目录与压缩包结构（含 Kavita 依赖的 `<漫画名>$<id>` 路径）、并发、限速、重试、重跑行为
5. 数据文件：`manga_library.json` 字段、默认值、读写时机；旧库文件能否被新后端直接读取
6. 外部集成：FlareSolverr、Kavita 登录/同步/扫描

产出 `docs/review/backend-parity.md`，每条发现标注：

- 严重度：阻断 / 重要 / 轻微
- 类型：bug / 遗漏 / 有意改动
- 处理：P1 内修复 / 归入 P2 / 接受并记录原因

规则：

- 阻断和重要级别的 bug 在 P1 内修复，每个修复带回归测试
- 涉及接口形状的改动留到 P2
- 本地无法验证的部分（真实抓取、真实 Kavita）整理成手动验证清单，由用户和 Allen 在测试环境执行，结果回填审核文档
- 审核同时回答两个 P2/P4 依赖的问题：任务重跑是否会重复下载已打包章节；`library/short`、`library/paginate`、`library/search` 是否有其他调用方
- P1 期间 Flask 代码原样保留

完成标准：审核文档定稿，阻断与重要问题已修复或有明确归属，手动验证清单已交付。

## 6. P2 · 接口收敛与后端加固

### 6.1 统一规则

- 所有 `/api` 响应为 `{ code, data }`；失败时附机器可读的 `error` 字符串（如 `manga-busy`、`search-expired`、`duplicate`）
- HTTP 状态如实反映成败，`code` 与 HTTP 状态一致；全局异常过滤器输出同一结构
- `manga_id` 全部为 string
- 搜索只返回封面 URL；库接口返回相对路径 `/api/library/:id/thumbnail`，旧记录中的绝对地址在读取时归一

### 6.2 接口变更

- `GET /api/library/:mangaId/chapters` 改读路径参数
- `POST /api/library` 只接受精简形态：`manga_id`、`source`、`submit_sign`
- 漫画记录新增 `updated_at`（unix 秒）：最新话推进或下载完成时写入；旧记录缺省取 `add_date`；`add_date` 不再被修改
- 新增 `GET /api/config`：`{ kavitaEnabled, kavitaExposeUrl, adminRequired }`
- Socket 事件：`download_started`、`chapter_completed`、`download_progress`、`download_completed`、`queue_updated`、`scan_completed`、`dmca_alert`

P2 期间旧的 `/api/dogemanga/*` 路由、旧事件名和 `/js/config.js` 保持可用，直到 P4 删除，现有前端在 P3 完成前不受影响。

### 6.3 危险操作保护

- 环境变量 `ADMIN_TOKEN`，未设置则不启用
- 启用后，`DELETE /api/library/:id` 和 `POST /api/library/rezip` 必须带请求头 `X-Admin-Token`，不匹配返回 401；比较用定长时间比较

### 6.4 下载队列持久化

- 队列状态写入库文件同目录的 `queue.json`（`QUEUE_FILE` 可覆盖），入队、出队、完成时原子写入
- 启动时恢复：排队任务按原顺序入队，中断的运行中任务放回队首
- 同一漫画的同类任务去重
- 若 P1 确认重跑会重复下载，在此补上跳过已完成章节的逻辑

### 6.5 测试

每条规则和新行为有单测；e2e 增加按新契约走完"搜索 → 添加 → 查库 → 删除"的流程，抓取器用现有假 CLI。Swagger 同步更新。

完成标准：新契约的测试全绿，Swagger 与实现一致。

## 7. P3 · 前端重做

开工前另做一轮带效果图的详细设计（配色、卡片、添加浮层、队列抽屉），产出 P3 自己的 spec。本节只定结构和范围。

### 7.1 技术栈

- 保留：Vue 3.5、Vite、TypeScript、Pinia、vue-router、socket.io-client、axios、Vitest
- 新增：Nuxt UI、Tailwind
- 移除：element-plus、vant、overlayscrollbars、`@element-plus/icons-vue`

Nuxt UI 在纯 Vue + Vite 下的安装方式和版本，写实现计划前对照官方文档核实。

### 7.2 现有代码去留

- 保留：axios 实例、`useSocket`、测试配置
- 改写：api 模块与类型、`utils/ui`、应用初始化、外壳
- 删除：`VPullButton`、`Announcement`（内容并入设置页）、`useResponsive`、http 拦截器中的信封补丁

### 7.3 路由

- `/` 漫画库
- `/settings` Kavita 账号与关于
- `/mainpage/*` 重定向到 `/`

添加漫画和下载队列是浮层，不占路由。

### 7.4 模块

| 模块 | 职责 |
|---|---|
| 外壳 | 顶栏：标志、搜索添加入口、队列按钮（数量角标）、设置入口；手机为底部三个标签 |
| 漫画库 | 卡片 / 列表两种视图、库内筛选、按 `updated_at` 排序；每部漫画的操作：开关自动更新、重下章节、删除、跳转 Kavita |
| 添加漫画 | 浮层：输入 → 结果 → 确认 → 重复二次确认 → 过期重搜 |
| 下载队列 | 抽屉：当前任务与进度、排队列表；手机全屏 |
| 章节选择 | 重下时的章节多选弹窗 |
| 设置 | Kavita 登录与状态、关于 |

### 7.5 数据流

四个 store：`library`、`queue`、`config`、`session`。Socket 在应用根部连接一次，事件统一分发到 store；组件只读 store，不直接监听 socket。

### 7.6 错误处理

api 层把失败转成带 `error` 字符串的类型化错误，一处映射为中文提示。401 时弹口令输入框并重试原操作；`search-expired` 时提示并一键重搜。管理员口令只存当前会话。

### 7.7 测试

- 单测：store、api 层、卡片、添加流程、队列抽屉
- 端到端：一条冒烟用例（真实后端 + 假抓取器）走完"搜索 → 添加 → 库里出现 → 删除"，并入 CI

完成标准：三项功能在桌面和手机视口可用，只调用新接口，测试全绿。

## 8. P4 · 遗留清理

P0–P3 验收后执行，只删除和整理。

后端：

- 删除全部 `/api/dogemanga/*` 处理器及专用代码（旧搜索控制器、旧版添加 DTO、旧版重下参数解析、搜索 base64 模式、旧 socket 事件名）
- 删除 `/js/config.js` 及 `MANGA_BASE_URL`、`MANGA_BASE_WEBSOCKET_URL` 两个环境变量（已由 `GET /api/config` 取代）
- `library/short`、`library/paginate`、`library/search`：P1 确认无其他调用方则删除

仓库：

- 删除 `main.py`、`requirements.txt`、`test.py`、`create_config_js.sh`、根 `Dockerfile`
- 删除 `frontend_src/`、`frontend_static/`
- `utils/` 只保留 `make_path.py`、`generate_file_path.py`、`chapter_title_reformat.py` 及其间接依赖
- `modules/DGmanga.py`、`modules/MangaSite.py` 不改动
- `dev_config/` 旧记录归档到 `docs/legacy/`
- 删除 `.DS_Store` 和已作废的 Plan 2a/2b 文档
- `backend/Dockerfile` 移到仓库根，构建命令为 `docker build -t vanmanga .`

文档：重写根 README（中英），含新架构、部署、环境变量、从 Flask 版升级步骤。

安全网：清理前打标签 `flask-final`。

完成标准：CI 全绿；镜像启动并通过冒烟用例；全仓搜索 `dogemanga` 只剩抓取源名 `dgmanga` 相关内容。

## 9. 不在范围内

- 镜像自动发布到 Docker Hub
- 多抓取源的界面支持
- 用户账号体系
