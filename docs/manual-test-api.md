# 逐接口人工测试

本文是 [`manual-test-checklist.md`](manual-test-checklist.md) 后端部分的必做项：对后端注册的**每一个** HTTP 路由和发出的**每一个** Socket.IO 事件，给出可直接运行的请求命令、真实响应和边界情况。接口定义见 [`api-contract.md`](api-contract.md)，代码结构见 [`architecture.md`](architecture.md)。

路由清单取自代码（`backend/src/**/*.controller.ts`、`events.gateway.ts`、`app.setup.ts`、`spa-fallback.ts`、`frontend.module.ts`、`swagger.ts`），并与启动日志里的 `Mapped {...}` 行、`/api/docs-json` 的 `paths` 核对过：API 路由共 20 个，三处完全一致。

## 标记说明

每个响应和每行边界情况都标明来源：

| 标记 | 含义 |
|---|---|
| **实测，假抓取器** | 2026-11-15 在本机用真实后端代码加假抓取器跑出来的结果，响应体按原样粘贴（只截短了长数组）。环境见[附录 B](#appendix-b) |
| **实测，假 Kavita** | 同上，Kavita 由一个本地假服务代替（只模拟登录、刷新、插件认证、系列列表、扫描目录五个接口） |
| **未实测，依据代码** | 本机做不到（真实源站、真实 Kavita、FlareSolverr、Linux 权限等），结论来自读代码和契约。每条都写了在真实环境里怎么复现 |

本机实测用的是 `NestFactory.create` + `configureApp` + Swagger 的启动方式，和 `backend/src/main.ts` 一致（只是跳过了 Node 版本的信任库检查）。这一点很重要：同一份代码用 e2e 测试的 `Test.createTestingModule` 方式启动时，有三处行为不同（见[第 11 节](#diff)）。

---

<a id="prepare"></a>
## 0. 准备

### 0.1 选环境

两种环境都要跑：

1. **真实环境**（主要）：`docker run` 起的镜像，或 Node 24.22.1 下 `node backend/dist/main.js`。用真实源站、真实 Kavita。标「未实测，依据代码」的行只能在这里测。
2. **本地假抓取器环境**（补充）：用于真实环境里很难触发的分支（Cloudflare 拦截、DMCA、429、抓取超时、全部章节失败等）。搭法见[附录 A](#appendix-a)。

每种环境至少按三套配置各跑一遍：

| 配置 | 环境变量 | 用来测 |
|---|---|---|
| A | `ADMIN_TOKEN=<口令>`，配好三个 `KAVITA_*` | 口令保护、Kavita、正常流程 |
| B | 不设 `ADMIN_TOKEN`，不设 `KAVITA_*` | 无口令时的放行、`kavita-disabled` |
| C | `CORS_ORIGINS=https://a.example,https://b.example` | 跨域 |

### 0.2 变量和辅助函数

Windows 上所有命令都在 **Git Bash** 里运行（不是 PowerShell，也不是 cmd）。每开一个终端先粘贴：

```bash
BASE=http://localhost:5000          # 后端地址
TOKEN='你的 ADMIN_TOKEN'            # 配置 B 下随便写
J='Content-Type: application/json'
# c：打印响应体，再单独一行打印 HTTP 状态码和 Content-Type
c() { curl -sS -w '\nHTTP %{http_code} %{content_type}\n' "$@"; }
```

下文所有命令都依赖这四行。

**中文和其他非 ASCII 字符一律写进 UTF-8 文件再用 `--data-binary @文件` 发送。** 本机实测：Windows 版 `curl.exe` 按系统代码页（中文系统是 GBK）接收命令行参数，`-d '{"title":"第2话"}'` 到了服务端变成 `"��2��"`（U+FFFD），后端照样接受，最后在磁盘上生成了 `��2��.zip`。在 Git Bash 里用 `printf` 写文件是 UTF-8，可以放心：

```bash
printf '%s' '{"manga_id":"漫画七","source":"dgmanga"}' > body.json
c -X POST "$BASE/api/library" -H "$J" --data-binary @body.json
```

URL 里的中文用百分号编码（例：`测试` → `%E6%B5%8B%E8%AF%95`）。

### 0.3 看日志

- 容器：`docker logs -f <容器名>`；本地：启动后端的那个终端。
- 每个成功请求一行：`LOG [HTTP] GET /api/config 1ms`。
- 每个失败请求一行：4xx 是 `WARN [AllExceptionsFilter] [GET] /api/no-such-route -> 404: Cannot GET /api/no-such-route`；5xx 是 `ERROR [AllExceptionsFilter] [GET] /api/scraper/dgmanga/search?q=boom -> 502`，后面跟堆栈（**只在日志里**，响应体里不能有）。
- 抓取失败时多一行 `WARN [ScraperFailure] Scraper call failed: <原因>`，原因里可能有内部地址、抓取进程输出。这些只能出现在日志里。
- 队列：`Enqueued task[full-manga, <id>] (queue size=N)`、`De-duplicated task[...]`、`Started task[...]`、`task[...] failed: <原因>`、`Restored N task(s) from <queue.json>`。
- 定时任务按**容器本地时区**的 01:30 触发：`=== Start Daily Update Task ===`。本次实测时本机时钟正好走到 01:30，扫描在测试中途把一部未完成的漫画重新入队了。测队列时看到"多出来"的任务，先查日志里有没有这一行。

### 0.4 重置数据

1. 停掉后端。
2. 删除（或换成新的空目录）：`LIBRARY_FILE`（默认 `eng_config/manga_library.json`）、同目录的 `queue.json` 和 `queue.json.corrupt-*`、`THUMBNAILS_DIR`、`DOWNLOAD_ROOT`。
3. 启动。日志出现 `Created new manga library at ...` 说明是空库。

搜索缓存只在内存里，重启就清空，不用手动清。

### 0.5 所有接口共同的边界情况

下面几类请求对所有带请求体的接口结果相同，各节表格里只列一两行代表性的，完整的在这里测一遍即可。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 方法不对 | `c -X PUT "$BASE/api/library" -H "$J" -d '{}'` | 404 | `{"code":404,"error":"not-found","message":"Cannot PUT /api/library"}` | 实测，假抓取器。不是 405 | [ ] |
| 请求体不是合法 JSON | `c -X POST "$BASE/api/download" -H "$J" -d '{bad'` | **实测 404**；契约为 400 | 实测：`{"code":404,"error":"not-found","message":"Cannot POST /api/download"}`；契约：`{"code":400,"error":"bad-request","message":"Expected property name or '}' in JSON at position 1 (line 1 column 2)"}` | 实测，假抓取器。**与契约不一致**，见[第 11 节](#diff) 第 1 条 | [ ] |
| 请求体是 JSON 的 `null` 或字符串 | `c -X POST "$BASE/api/library" -H "$J" -d 'null'`（或 `-d '"str"'`） | 实测 404 | `{"code":404,"error":"not-found","message":"Cannot POST /api/library"}` | 实测，假抓取器。body-parser 严格模式拒绝非对象/数组，原因同上 | [ ] |
| 请求体是 JSON 数组 | `c -X POST "$BASE/api/library" -H "$J" -d '[]'` | 400 | `{"code":400,"error":"validation-failed","message":"manga_id should not be empty; manga_id must be a string; source should not be empty; source must be a string"}` | 实测，假抓取器 | [ ] |
| 请求体超过 1 MB | 见下方命令 | **实测 404**；契约为 413 | 实测：`{"code":404,"error":"not-found","message":"Cannot POST /api/download/chapters"}`；契约：`{"code":413,"error":"payload-too-large"}` | 实测，假抓取器（1,548,709 字节）。**与契约不一致**，见[第 11 节](#diff) 第 1 条。日志里只有一行 404 WARN | [ ] |
| 请求体接近但不到 1 MB | 同上，但 `5000` 个章节、短标题（约 660 KB） | 404 | `{"code":404,"error":"manga-not-found","message":"Unknown manga: -nope"}` | 实测，假抓取器。说明正常解析了，只是 id 不存在 | [ ] |
| 不带 `Content-Type` 或 `text/plain` | `c -X POST "$BASE/api/library" -H 'Content-Type: text/plain' -d '{"manga_id":"x","source":"dgmanga"}'` | 400 | `{"code":400,"error":"validation-failed","message":"manga_id should not be empty; manga_id must be a string; source should not be empty; source must be a string"}` | 实测，假抓取器。请求体被忽略，当作空对象 | [ ] |
| 表单编码 | `c -X POST "$BASE/api/library" -d 'manga_id=x&source=dgmanga'`（curl 默认 `application/x-www-form-urlencoded`） | 410 | `{"code":410,"error":"search-expired","message":"Candidate no longer in the search cache; search again"}` | 实测，假抓取器。表单也会被解析（`app.setup.ts` 注册了 urlencoded 解析器），所以走到了缓存查找 | [ ] |
| 多余字段 | 在任意请求体里加 `"x":1` | 与不加时相同 | — | 实测，假抓取器。`whitelist: true` 把未声明的字段丢掉，不报错 | [ ] |
| 不带请求体 | `c -X POST "$BASE/api/library"` | 400 | 同"`text/plain`"那行 | 实测，假抓取器 | [ ] |
| 5xx 响应不泄露内部信息 | 触发任意 5xx（如 3.2 的 `q=boom`） | 5xx | 只有 `code`、`error`、固定的 `message` | 实测，假抓取器。假抓取器的错误里故意带了 `http://10.0.0.5:8191`，它只出现在日志 `WARN [ScraperFailure]` 行，不在响应里 | [ ] |

生成超过 1 MB 的请求体（Git Bash，任意目录）：

```bash
node -e "const c=[];for(let i=0;i<8000;i++)c.push({index:i+1,title:'第'+(i+1)+'话 '+'x'.repeat(60),url:'https://dogemanga.com/p/'+'y'.repeat(60)+i});require('fs').writeFileSync('big.json',JSON.stringify({manga_id:'-nope',chapters:c}))"
c -X POST "$BASE/api/download/chapters" -H "$J" --data-binary @big.json
```

---

<a id="summary"></a>
## 1. 接口总览

🔒 = 设置了 `ADMIN_TOKEN` 时需要 `X-Admin-Token`。"实测"列：✔ = 正常请求和大部分边界情况已实测；△ = 只能部分实测。

| # | 方法 | 路径 | 🔒 | 章节 | 实测 |
|---|---|---|---|---|---|
| 1 | GET | `/api/config` | | [2.1](#get-config) | ✔ |
| 2 | GET | `/api/scraper/sources` | | [3.1](#get-sources) | ✔ |
| 3 | GET | `/api/scraper/:source/search?q=` | | [3.2](#get-search) | △（无真实源站） |
| 4 | GET | `/api/scraper/:source/search-thumbnail/:mangaId` | | [3.3](#get-search-thumb) | ✔ |
| 5 | GET | `/api/scraper/:source/manga/:mangaId/metadata` | | [3.4](#get-metadata) | △ |
| 6 | GET | `/api/scraper/:source/manga/:mangaId/chapters` | | [3.5](#get-scraper-chapters) | △ |
| 7 | GET | `/api/scraper/:source/chapter-images?url=` | | [3.6](#get-chapter-images) | △ |
| 8 | GET | `/api/library` | | [4.1](#get-library) | ✔ |
| 9 | POST | `/api/library` | | [4.2](#post-library) | ✔ |
| 10 | GET | `/api/library/:mangaId/thumbnail` | | [4.3](#get-thumbnail) | ✔ |
| 11 | GET | `/api/library/:mangaId/chapters` | | [4.4](#get-library-chapters) | △ |
| 12 | POST | `/api/library/:mangaId/auto-update` | | [4.5](#post-auto-update) | ✔ |
| 13 | DELETE | `/api/library/:mangaId` | 🔒 | [4.6](#delete-library) | ✔（`delete-failed` 用 Windows 权限模拟） |
| 14 | POST | `/api/library/rezip` | 🔒 | [4.7](#post-rezip) | ✔ |
| 15 | POST | `/api/download` | | [5.1](#post-download) | ✔ |
| 16 | POST | `/api/download/chapters` | | [5.2](#post-download-chapters) | ✔ |
| 17 | GET | `/api/download/queue` | | [5.3](#get-queue) | ✔ |
| 18 | GET | `/api/download/current` | | [5.4](#get-current) | ✔ |
| — | — | 重启后队列恢复 | | [5.5](#restart) | ✔ |
| 19 | POST | `/api/kavita/login` | | [6.1](#post-kavita-login) | △（假 Kavita） |
| 20 | POST | `/api/kavita/refreshtoken` | | [6.2](#post-kavita-refresh) | △（假 Kavita） |
| 21 | GET | `/assets/*`、`/favicon.ico` 等静态文件 | | [7.1](#static) | ✔ |
| 22 | GET | SPA 回退（`/`、`/settings`、`/mainpage/...`） | | [7.2](#spa) | ✔ |
| 23 | GET | `/api/docs`、`/api/docs-json` | | [7.3](#docs) | ✔ |
| 24 | 任意 | 未知的 `/api/*` | | [7.4](#unknown-api) | ✔ |
| 25 | GET | `/socket.io/`（HTTP 握手） | | [7.5](#socketio-http) | ✔ |
| 26 | 任意 | 已删除的旧接口（`/api/dogemanga/*` 等 6 组） | | [8](#removed) | ✔ |
| 27 | — | 跨域（HTTP 与 Socket.IO） | | [9](#cors) | △ |
| 28–34 | 推送 | Socket.IO 七个事件 | | [10](#socket) | ✔（`dmca_alert` 用假抓取器） |

---

<a id="config-section"></a>
## 2. 运行时配置

<a id="get-config"></a>
### 2.1 `GET /api/config`

- 用途：前端启动时读取服务端配置。
- 🔒：否。磁盘、队列：无任何操作。值在启动时算好，运行中不变。

```bash
c "$BASE/api/config"
```

真实响应（实测，配置 A，假 Kavita）：

```
{"code":200,"data":{"kavitaEnabled":true,"kavitaExposeUrl":"http://127.0.0.1:5462","adminRequired":true}}
HTTP 200 application/json; charset=utf-8
```

配置 B（实测）：

```
{"code":200,"data":{"kavitaEnabled":false,"kavitaExposeUrl":null,"adminRequired":false}}
```

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 设了 `ADMIN_TOKEN` | 正常请求 | 200 | `data.adminRequired: true` | 实测 | [ ] |
| 没设 `ADMIN_TOKEN` | 正常请求 | 200 | `data.adminRequired: false` | 实测（配置 B） | [ ] |
| `ADMIN_TOKEN` 只有空格 | 以 `ADMIN_TOKEN='   '` 启动 | 200 | `data.adminRequired: false` | 未实测，依据代码（`configuration.ts` 对口令做了 `trim()`）。在真实环境按此启动后请求一次 | [ ] |
| 三个 `KAVITA_*` 都设了 | 正常请求 | 200 | `kavitaEnabled: true`，`kavitaExposeUrl` 等于 `KAVITA_EXPOSE_URL` | 实测，假 Kavita | [ ] |
| 只设了部分 `KAVITA_*` | 例如只设 `KAVITA_BASE_URL` 和 `KAVITA_EXPOSE_URL` | 200 | `kavitaEnabled: false`，`kavitaExposeUrl: null` | 未实测，依据代码（三个都非空才算启用）；单测 `frontend.controller.spec.ts` 覆盖了"半配置时不暴露地址" | [ ] |
| 带查询参数 | `c "$BASE/api/config?x=1"` | 200 | 与正常请求相同 | 实测 | [ ] |
| 方法不对 | `c -X POST "$BASE/api/config"` | 404 | `{"code":404,"error":"not-found","message":"Cannot POST /api/config"}` | 实测 | [ ] |
| 健康检查 | `docker ps` | — | 容器状态 healthy | 未实测，依据 Dockerfile（健康检查请求的就是这个接口）。真实环境里看 | [ ] |
| 重复请求 | 连续请求 3 次 | 200 | 三次完全相同 | 实测 | [ ] |

---

<a id="scraper-section"></a>
## 3. 抓取源

<a id="get-sources"></a>
### 3.1 `GET /api/scraper/sources`

- 用途：列出已注册的抓取源。🔒：否。磁盘、队列：无操作。

```bash
c "$BASE/api/scraper/sources"
```

真实响应（实测）：

```
{"code":200,"data":[{"name":"dgmanga","displayName":"DogeManga"}]}
HTTP 200 application/json; charset=utf-8
```

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 正常 | 如上 | 200 | 如上，只有一项 | 实测；启动日志有 `Registered manga source: dgmanga (DogeManga)` | [ ] |
| 方法不对 | `c -X POST "$BASE/api/scraper/sources"` | 404 | `{"code":404,"error":"not-found","message":"Cannot POST /api/scraper/sources"}` | 依据实测的同类路由 | [ ] |
| 结尾多斜杠 | `c "$BASE/api/scraper/sources/"` | 200 | 同正常 | 未实测，依据 Express 默认不区分结尾斜杠 | [ ] |

<a id="get-search"></a>
### 3.2 `GET /api/scraper/:source/search?q=<关键词>`

- 用途：在源站搜索。🔒：否。
- 做什么：启动一次抓取子进程（`scrape_cli.py --source <src> search -- <q>`）；结果写入**内存**搜索缓存（默认 30 分钟，`SEARCH_CACHE_TTL_MS`；最多 500 条，`SEARCH_CACHE_MAX_ENTRIES`）。磁盘、队列：无操作。
- `manga_id` 含 `/`、`\`、控制字符，或等于 `.`、`..` 的结果会被丢掉，日志 `WARN [ScraperService] dgmanga: dropping search result with unsafe manga_id "a/b"`。

```bash
c "$BASE/api/scraper/dgmanga/search?q=%E6%B5%8B%E8%AF%95"     # q=测试
```

真实响应（实测，假抓取器；8 项中截取 3 项）：

```
{"code":200,"data":[
 {"manga_id":"-neg1","manga_name":"测试漫画一","artist_name":"测试作者","newest_epi":"第12话","thumbnail":"/api/scraper/dgmanga/search-thumbnail/-neg1","source":"dgmanga"},
 {"manga_id":"img2","manga_name":"有图漫画","artist_name":"作者二","newest_epi":"第2话","recent_update_date":"2026-11-14","thumbnail":"/api/scraper/dgmanga/search-thumbnail/img2","source":"dgmanga"},
 {"manga_id":"漫画七","manga_name":"Unicode 编号漫画","artist_name":"作者七","newest_epi":"第1话","thumbnail":"/api/scraper/dgmanga/search-thumbnail/%E6%BC%AB%E7%94%BB%E4%B8%83","source":"dgmanga"}
 ...]}
HTTP 200 application/json; charset=utf-8
```

注意 `thumbnail` 里的 `manga_id` 做了 `encodeURIComponent`（`漫画七` → `%E6%BC%AB%E7%94%BB%E4%B8%83`），以 `-` 开头的 id 原样保留。真实源站的字段相同，值换成真实漫画。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 真实源站搜一部存在的漫画 | `q=<真实漫画名，百分号编码>` | 200 | `data` 非空，每项有 `manga_id`、`manga_name`、`artist_name`、`newest_epi`、`thumbnail`、`source` | 未实测，依据代码。在真实环境搜一部熟悉的漫画，核对名字、作者、最新话；每个 `thumbnail` 地址都能打开（3.3） | [ ] |
| 没有结果 | `c "$BASE/api/scraper/dgmanga/search?q=nothing"`（假抓取器）；真实环境用一串乱码 | 200 | `{"code":200,"data":[]}` | 实测，假抓取器（源站状态 457 被转成空数组）。真实环境里再测一次乱码关键词 | [ ] |
| 缺 `q` | `c "$BASE/api/scraper/dgmanga/search"` | 400 | `{"code":400,"error":"query-required","message":"q must not be empty"}` | 实测；不启动子进程 | [ ] |
| `q` 为空 | `...search?q=` | 400 | 同上 | 实测 | [ ] |
| `q` 只有空白 | `...search?q=%20%20` | 400 | 同上 | 实测 | [ ] |
| `q` 以 `-` 开头 | `...search?q=-rf` | 200 | 正常结果 | 实测；日志 `spawn ... search -- -rf`，`--` 保证不被当成命令行选项 | [ ] |
| `q` 出现两次 | `...search?q=a&q=b` | 200 | 正常结果 | 实测；两个值被拼成 `a,b` 传给抓取器（日志 `search -- a,b`） | [ ] |
| `q` 很长（3000 字符） | `...search?q=$(printf 'x%.0s' $(seq 1 3000))` | 200 | 假抓取器返回正常结果 | 实测。真实源站可能返回空或报错，记录现象 | [ ] |
| URL 超长（约 20 000 字符） | 同上但 20000 | 431 | 无 JSON 信封（Node HTTP 层直接拒绝，不进应用） | 实测（在 4.3 的路径上测的，任何路由都一样） | [ ] |
| 未知源 | `c "$BASE/api/scraper/nosuch/search?q=x"` | 404 | `{"code":404,"error":"unknown-source","message":"Unknown manga source: 'nosuch'. Registered: dgmanga"}` | 实测；不启动子进程 | [ ] |
| 源名大小写不同 | `.../scraper/DGmanga/search?q=x` | 404 | `unknown-source`，message 里是 `'DGmanga'` | 未实测，依据代码（`Map` 精确匹配） | [ ] |
| 抓取进程报错 | `q=boom`（假抓取器返回 `ok:false`） | 502 | `{"code":502,"error":"scraper-failed","message":"The scraper failed"}` | 实测；日志 `WARN [ScraperFailure] Scraper call failed: fake boom at http://10.0.0.5:8191` 和一行带堆栈的 `ERROR`；响应里没有这个地址 | [ ] |
| 抓取进程输出不是 JSON | `q=garbage` | 502 | 同上 | 实测；日志 `Could not parse Python CLI result: Unexpected token 'o', "not json" is not valid JSON` | [ ] |
| 抓取超时 | `q=hang`，后端以 `PYTHON_TIMEOUT_MS=8000` 启动 | 502（约 8 秒后） | 同上 | 实测，耗时 8.02 秒；日志 `Python CLI timed out after 8000ms`。**真实环境复现**：以 `PYTHON_TIMEOUT_MS=1` 启动容器后搜任意词 | [ ] |
| 抓取进程起不来 | 真实环境把 `PYTHON_CLI_SCRIPT` 指向不存在的文件，或 `PYTHON_EXECUTABLE=nope` | 502 | 同上 | 未实测，依据代码（`Failed to spawn python` / `produced no result line`）。检查容器不退出 | [ ] |
| 源站 Cloudflare 拦截、FlareSolverr 停掉 | 真实环境 | 502 | `scraper-failed`（搜索没有 `scraper-blocked` 分支） | 未实测，依据代码。复现见清单 1.9、3.8 | [ ] |
| 结果里有不安全的 id | `q=unsafe`（假抓取器返回 `a/b`、`..`、`safe9`） | 200 | `{"code":200,"data":[{"manga_id":"safe9","manga_name":"安全漫画",...}]}` | 实测；只剩 `safe9`。日志两行 `dropping search result with unsafe manga_id` | [ ] |
| 中文关键词 | `q=%E6%B5%8B%E8%AF%95` | 200 | 正常结果 | 实测（假抓取器不看关键词）。真实环境里用中文名搜一次 | [ ] |
| 重复搜索同一词 | 连续两次 | 200 | 两次相同 | 实测；第二次刷新缓存时间 | [ ] |
| 并发搜索 | 同时发 3 个 `&` 请求 | 200 ×3 | 各自完整 | 未单独实测。真实环境里各启动一个子进程，看日志有 3 行 `spawn` | [ ] |
| 方法不对 | `c -X POST "$BASE/api/scraper/dgmanga/search?q=x"` | 404 | `{"code":404,"error":"not-found","message":"Cannot POST /api/scraper/dgmanga/search?q=x"}` | 实测 | [ ] |
| 重启后 | 重启后端 | — | 搜索本身正常；但之前的结果从缓存里没了（4.2 得到 410，3.3 得到 404） | 实测 | [ ] |

<a id="get-search-thumb"></a>
### 3.3 `GET /api/scraper/:source/search-thumbnail/:mangaId`

- 用途：搜索结果的封面。数据来自内存缓存（搜索时源站给的 base64），不读磁盘、不访问源站。🔒：否。

```bash
c "$BASE/api/scraper/dgmanga/search?q=x" > /dev/null      # 先搜索
curl -sS -o cover.jpg -w 'HTTP %{http_code} %{content_type} %{size_download}B\n' "$BASE/api/scraper/dgmanga/search-thumbnail/-neg1"
```

真实响应（实测，假抓取器）：

```
HTTP 200 image/jpeg 68B
```

假抓取器给的是一个 1×1 PNG，但响应头一律是 `image/jpeg`。真实环境里应是真实封面，用浏览器直接打开地址看图。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 正常 | 如上 | 200 | `image/jpeg` 二进制 | 实测 | [ ] |
| Unicode id | `.../search-thumbnail/%E6%BC%AB%E7%94%BB%E4%B8%83` | 200 | `image/jpeg` | 实测 | [ ] |
| 没搜索过的 id | `.../search-thumbnail/never` | 404 | `{"code":404,"error":"thumbnail-not-found"}` | 实测；没有 `message` | [ ] |
| 缓存过期 | 搜索后等过 TTL（实测用 `SEARCH_CACHE_TTL_MS=30000`，等 32 秒） | 404 | `{"code":404,"error":"thumbnail-not-found"}` | 实测：过期前 200，过期后 404 | [ ] |
| 重启后 | 搜索 → 重启 → 请求 | 404 | 同上 | 实测（重启后缓存为空） | [ ] |
| 未知源 | `.../scraper/nosuch/search-thumbnail/-neg1` | 404 | `{"code":404,"error":"thumbnail-not-found"}` | 实测。注意不是 `unknown-source` | [ ] |
| id 是编码后的 `/` | `.../search-thumbnail/a%2Fb` | 404 | `{"code":404,"error":"thumbnail-not-found"}` | 实测 | [ ] |
| id 含字面 `/` | `.../search-thumbnail/a/b` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/scraper/dgmanga/search-thumbnail/a/b"}` | 实测 | [ ] |
| id 为空 | `.../search-thumbnail/` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/scraper/dgmanga/search-thumbnail/"}` | 实测 | [ ] |
| 被安全过滤丢掉的 id | `q=unsafe` 后请求 `.../search-thumbnail/..` | 404 | `not-found` 或 `thumbnail-not-found` | 未单独实测；`..` 会被 curl 规范化掉路径段，加 `--path-as-is` 再测 | [ ] |
| 超过缓存条数上限 | `SEARCH_CACHE_MAX_ENTRIES=2` 启动，搜一次（8 项）后取第一项 | 404 | `thumbnail-not-found` | 未实测，依据代码（先进先出淘汰）。单测 `search-cache.service.spec.ts` 覆盖 | [ ] |

<a id="get-metadata"></a>
### 3.4 `GET /api/scraper/:source/manga/:mangaId/metadata`（调试用）

- 用途：直接查源站的章节数和连载状态。前端不调用。🔒：否。磁盘、队列：无。每次启动一个抓取子进程。

```bash
c "$BASE/api/scraper/dgmanga/manga/img2/metadata"
```

真实响应（实测，假抓取器）：

```
{"code":200,"data":{"chapterCount":2,"serialization":0}}
HTTP 200 application/json; charset=utf-8
```

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 真实漫画 | 用一个真实 `manga_id` | 200 | `chapterCount` 等于源站章节数；`serialization` 已完结为 1 | 未实测，依据代码。和源站页面对一下 | [ ] |
| id 以 `-` 开头 | `.../manga/-neg1/metadata` | 200 | `{"code":200,"data":{"chapterCount":1,"serialization":0}}` | 实测；日志 `metadata -- -neg1` | [ ] |
| DMCA 下架 | `.../manga/dmca5/metadata`（假抓取器返回 `errorCode: 504`） | 451 | `{"code":451,"error":"dmca","message":"Removed at the source (DMCA)"}` | 实测。这个调试接口**不会**删库里的记录（删除只发生在下载任务里） | [ ] |
| Cloudflare 拦截 | `.../manga/cfm1/metadata`（`errorCode: 501`） | 502 | `{"code":502,"error":"scraper-blocked","message":"Source is behind a Cloudflare challenge"}` | 实测 | [ ] |
| 源站限流 | `.../manga/rl1/metadata`（`errorCode: 429`） | 429 | `{"code":429,"error":"rate-limited","message":"Source rate limited the request"}` | 实测（真实 dgmanga 源在这里不会报 429） | [ ] |
| 抓取进程失败 | `.../manga/boom1/metadata` | 502 | `{"code":502,"error":"scraper-failed","message":"The scraper failed"}` | 实测 | [ ] |
| 源返回其他 errorCode | 假抓取器返回 `data.errorCode: 503` | 502 | `{"code":502,"error":"scraper-failed","message":"Source returned status 503"}` | 未实测，依据 `scrape-errors.ts` 默认分支。见[第 11 节](#diff) 第 8 条 | [ ] |
| 未知源 | `.../scraper/nosuch/manga/img2/metadata` | 404 | `{"code":404,"error":"unknown-source","message":"Unknown manga source: 'nosuch'. Registered: dgmanga"}` | 实测 | [ ] |
| 源站上不存在的 id | 真实环境随便写一个 id | 502 或 200（`chapterCount: 0`） | 记录实际结果 | 未实测，取决于源站和 Python 端 | [ ] |
| 超时 | `PYTHON_TIMEOUT_MS=1` | 502 | `scraper-failed` | 未单独实测（同 3.2 超时行） | [ ] |

<a id="get-scraper-chapters"></a>
### 3.5 `GET /api/scraper/:source/manga/:mangaId/chapters`（调试用）

- 用途：直接取源站章节列表。🔒：否。磁盘、队列：无。

```bash
c "$BASE/api/scraper/dgmanga/manga/img2/chapters"
```

真实响应（实测，假抓取器）：

```
{"code":200,"data":[{"index":1,"title":"第1话","url":"http://127.0.0.1:5462/ch/img2/1"},{"index":2,"title":"第2话","url":"http://127.0.0.1:5462/ch/img2/2"}]}
HTTP 200 application/json; charset=utf-8
```

真实源站的 `url` 是 `https://dogemanga.com/p/...`。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 真实漫画 | 真实 id | 200 | 章节按源站顺序，`index` 从 1 连续递增 | 未实测。和源站页面对一下数量和第一、最后一话 | [ ] |
| 没有章节 | `.../manga/-neg1/chapters` | 200 | `{"code":200,"data":[]}` | 实测 | [ ] |
| Cloudflare 拦截 | `.../manga/cf4/chapters` | 502 | `{"code":502,"error":"scraper-blocked","message":"Source is behind a Cloudflare challenge"}` | 实测 | [ ] |
| DMCA | `.../manga/dmca5/chapters` | 451 | `{"code":451,"error":"dmca","message":"Removed at the source (DMCA)"}` | 实测；库记录不受影响 | [ ] |
| 限流 | `.../manga/rl1/chapters` | 429 | `{"code":429,"error":"rate-limited","message":"Source rate limited the request"}` | 实测（真实 dgmanga 源不会在章节列表上报 429） | [ ] |
| 抓取进程失败 | `.../manga/boom1/chapters` | 502 | `{"code":502,"error":"scraper-failed","message":"The scraper failed"}` | 实测 | [ ] |
| 未知源 | `.../scraper/nosuch/manga/x/chapters` | 404 | `unknown-source` | 依据 3.4 的实测 | [ ] |

<a id="get-chapter-images"></a>
### 3.6 `GET /api/scraper/:source/chapter-images?url=<章节页>`（调试用）

- 用途：取某一章的图片地址。🔒：否。磁盘、队列：无（不下载图片）。

```bash
c "$BASE/api/scraper/dgmanga/chapter-images?url=http%3A%2F%2F127.0.0.1%3A5462%2Fch%2Fimg2%2F1"
```

真实响应（实测，假抓取器）：

```
{"code":200,"data":{"chapterTitle":"第1话","imageUrls":["http://127.0.0.1:5462/img/1.jpg","http://127.0.0.1:5462/img/2.jpg"],"requestHeaders":{}}}
HTTP 200 application/json; charset=utf-8
```

真实环境：`url` 用 3.5 返回的某个 `url`（百分号编码），`imageUrls` 应能在浏览器里打开（可能需要 `requestHeaders` 里的 Referer）。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 真实章节 | 真实 `url` | 200 | `imageUrls` 数量等于该章页数 | 未实测 | [ ] |
| 缺 `url` | `c "$BASE/api/scraper/dgmanga/chapter-images"` | 实测 200（假抓取器） | `{"code":200,"data":{"chapterTitle":"第1话",...}}` | 实测：**没有参数校验**，空值被直接传给抓取进程（日志 `chapter-images -- `）。真实抓取器预计返回 502 `scraper-failed`。见[第 11 节](#diff) 第 4 条 | [ ] |
| 章节失败 | `?url=fail://x` | 502 | `{"code":502,"error":"scraper-failed","message":"The scraper failed"}` | 实测 | [ ] |
| 限流 | `?url=rl://x` | 429 | `{"code":429,"error":"rate-limited","message":"Source rate limited the request"}` | 实测；真实 dgmanga 源会在这里报 429 | [ ] |
| Cloudflare | `?url=cf://x` | 502 | `{"code":502,"error":"scraper-blocked","message":"Source is behind a Cloudflare challenge"}` | 实测 | [ ] |
| DMCA | `?url=dmca://x` | 451 | `{"code":451,"error":"dmca","message":"Removed at the source (DMCA)"}` | 实测 | [ ] |
| 抓取进程失败 | `?url=boom://x` | 502 | `scraper-failed` | 实测 | [ ] |
| 不是源站的地址 | 真实环境 `?url=https%3A%2F%2Fexample.com` | 502 或 200 空数组 | 记录实际结果 | 未实测，取决于 Python 端 | [ ] |

---

<a id="library-section"></a>
## 4. 漫画库

<a id="get-library"></a>
### 4.1 `GET /api/library`

- 用途：全部漫画（规范形态）。🔒：否。只读内存里的库，不读磁盘。顺序是库文件里的顺序（加入顺序）。

```bash
c "$BASE/api/library"
```

真实响应（实测，假抓取器；7 项中截取 2 项）：

```
{"code":200,"data":[
 {"manga_id":"-neg1","manga_name":"测试漫画一","artist_name":"测试作者","newest_epi":"第12话","thumbnail":"/api/library/-neg1/thumbnail","source":"dgmanga","last_epi":1,"last_epi_name":"","completed":true,"serialization":0,"download_switch":0,"add_date":1794731231.009,"updated_at":1794731231.009,"kavita_url":null},
 {"manga_id":"img2","manga_name":"有图漫画","artist_name":"作者二","newest_epi":"第2话","thumbnail":"/api/library/img2/thumbnail","source":"dgmanga","recent_update_date":"2026-11-14","last_epi":2,"last_epi_name":"第2话","completed":true,"serialization":0,"download_switch":0,"add_date":1794731373.224,"updated_at":1794731376,"kavita_url":"http://127.0.0.1:5462/library/1/series/42"}
]}
HTTP 200 application/json; charset=utf-8
```

`img2` 的 `kavita_url` 是重启时的 Kavita 同步填上的（假 Kavita 返回了文件夹 `/manga/有图漫画$img2`、系列 id 42）。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 空库 | 重置数据后请求 | 200 | `{"code":200,"data":[]}` | 依据代码；日志 `Created new manga library at ...` | [ ] |
| 旧记录：带域名的封面地址 | 库文件里 `"thumbnail":"http://old.example:5000/api/dogemanga/thumbnail?mid=old1"` | 200 | 该项 `"thumbnail":"/api/library/old1/thumbnail"` | 实测（配置 B 预置了旧记录）；库文件本身不改 | [ ] |
| 旧记录：`kavita_url` 是 `"None"` | 库文件 `"kavita_url":"None"` | 200 | `"kavita_url":null` | 实测。注意新添加的记录在库文件里也存的是 `"None"` | [ ] |
| 旧记录：没有 `updated_at`、`source` | 库文件里删掉这两个字段 | 200 | `"updated_at"` 等于 `add_date`（实测 `1700000000.5`），`"source":"dgmanga"` | 实测 | [ ] |
| 旧记录：多余字段 | 库文件 `"legacy_field":"keep"` | 200 | 原样出现在响应里 | 实测 | [ ] |
| 用 Flask 版真实库 | 生产库副本 | 200 | 数量与原库一致 | 未实测，见清单 1.2 | [ ] |
| 库很大（几百部） | 生产库副本 | 200 | 响应时间看日志 `[HTTP] GET /api/library Nms` | 未实测 | [ ] |
| 下载进行中 | 下载时请求 | 200 | 正在下载的那部 `last_epi` 随章节推进 | 实测（`img2` 从 1 到 2） | [ ] |
| 方法不对 | `c -X PUT "$BASE/api/library"` | 404 | `{"code":404,"error":"not-found","message":"Cannot PUT /api/library"}` | 实测 | [ ] |
| `GET /api/library/<id>`（没有这个路由） | `c "$BASE/api/library/img2"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/library/img2"}` | 实测 | [ ] |

<a id="post-library"></a>
### 4.2 `POST /api/library` — 添加漫画

- 用途：把搜索结果里的一部加入库。🔒：否。
- 做什么：从**搜索缓存**取候选 → 查重 → 把封面写到 `THUMBNAILS_DIR/<manga_id>.jpg` → 写入库文件 → 自动排入一个 `full-manga` 任务（推送 `queue_updated`）。
- 只看 `manga_id`、`source`、`submit_sign` 三个字段。
- 检查顺序（实测确认）：`submit_sign: '2'` → 已在库中 → 缓存里没有（410）→ 查重（409）→ 添加。

```bash
c "$BASE/api/scraper/dgmanga/search?q=x" > /dev/null       # 必须先搜索
c -X POST "$BASE/api/library" -H "$J" -d '{"manga_id":"-neg1","source":"dgmanga"}'
```

真实响应（实测，假抓取器）：

```
{"code":200,"data":{"status":"added","manga":{"manga_id":"-neg1","manga_name":"测试漫画一","artist_name":"测试作者","newest_epi":"第12话","thumbnail":"/api/library/-neg1/thumbnail","source":"dgmanga","last_epi":1,"last_epi_name":"","completed":false,"serialization":0,"download_switch":0,"add_date":1794731231.009,"updated_at":1794731231.009,"kavita_url":null}}}
HTTP 200 application/json; charset=utf-8
```

之后还要检查：`THUMBNAILS_DIR/-neg1.jpg` 存在；库文件里有 `"-neg1"`；日志 `=== MANGA ADDED: 测试漫画一 (-neg1) from dgmanga ===`、`Enqueued task[full-manga, -neg1]`；Socket 收到 `queue_updated`（入队）。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 真实源站添加 | 真实搜索后添加 | 200 | `status: "added"` | 未实测。封面文件是真实图片；下载任务开始 | [ ] |
| 已在库中 | 同一请求再发一次 | 409 | `{"code":409,"error":"already-in-library","data":{"manga":{"manga_id":"-neg1",...,"completed":true,...}}}` | 实测。没有 `message`；不入队 | [ ] |
| 名字相近 | `{"manga_id":"-neg1x","source":"dgmanga"}`（`测试漫画一!` 对 `测试漫画一`） | 409 | `{"code":409,"error":"duplicate","message":"Similar manga already in the library; resubmit with submit_sign=1","data":{"duplicates":["测试漫画一"]}}` | 实测；不写文件、不入队 | [ ] |
| 名字相近，`submit_sign:"0"` | 同上加 `"submit_sign":"0"` | 409 | 同上 | 实测 | [ ] |
| 用户取消 | 加 `"submit_sign":"2"` | 200 | `{"code":200,"data":{"status":"cancelled"}}` | 实测；什么都不做 | [ ] |
| 用户确认 | 加 `"submit_sign":"1"` | 200 | `status: "added"`，`manga.manga_name` 为 `测试漫画一!` | 实测 | [ ] |
| 取消一个从没搜过的 id | `{"manga_id":"zz","source":"dgmanga","submit_sign":"2"}` | 200 | `{"code":200,"data":{"status":"cancelled"}}` | 实测；`'2'` 最先判断，不查缓存 | [ ] |
| 取消一个已在库的 id | `{"manga_id":"-neg1","source":"dgmanga","submit_sign":"2"}` | 200 | `cancelled` | 实测 | [ ] |
| 没搜过 | `{"manga_id":"never-searched","source":"dgmanga"}` | 410 | `{"code":410,"error":"search-expired","message":"Candidate no longer in the search cache; search again"}` | 实测 | [ ] |
| 缓存过期 | 搜索后等过 TTL 再添加 | 410 | 同上 | 实测（TTL 30 秒，等 32 秒） | [ ] |
| 重启后 | 搜索 → 重启 → 添加 | 410 | 同上 | 实测 | [ ] |
| 未知源 | `{"manga_id":"img2","source":"nosuch"}` | 410 | 同上 | 实测；契约写明未知源也是 410 | [ ] |
| 源名对、id 在别的源缓存里 | 只有一个源，无法测 | — | — | 不适用 | [ ] |
| 缺字段 | `-d '{}'` | 400 | `{"code":400,"error":"validation-failed","message":"manga_id should not be empty; manga_id must be a string; source should not be empty; source must be a string"}` | 实测 | [ ] |
| 空字符串 | `{"manga_id":"","source":""}` | 400 | `{"code":400,"error":"validation-failed","message":"manga_id should not be empty; source should not be empty"}` | 实测 | [ ] |
| 类型不对 | `{"manga_id":123,"source":"dgmanga"}` | 400 | `{"code":400,"error":"validation-failed","message":"manga_id must be a string"}` | 实测 | [ ] |
| `submit_sign` 是数字 | `"submit_sign":1` | 400 | `{"code":400,"error":"validation-failed","message":"submit_sign must be one of the following values: 0, 1, 2"}` | 实测；必须是字符串 | [ ] |
| `submit_sign` 非法值 | `"submit_sign":"3"` | 400 | 同上 | 实测 | [ ] |
| id 含 `/` | `{"manga_id":"a/b","source":"dgmanga"}` | 410 | `search-expired` | 实测；这种 id 搜索时就被丢掉了，缓存里不可能有 | [ ] |
| id 是 `..` | `{"manga_id":"..","source":"dgmanga"}` | 410 | `search-expired` | 实测；不会写出 `../.jpg` | [ ] |
| Unicode id | `printf '%s' '{"manga_id":"漫画七","source":"dgmanga"}' > b.json` 后 `--data-binary @b.json` | 200 | `status: "added"`，`"thumbnail":"/api/library/%E6%BC%AB%E7%94%BB%E4%B8%83/thumbnail"` | 实测；封面文件 `漫画七.jpg` | [ ] |
| 中文直接写在 `-d` 里 | `-d '{"manga_id":"漫画七",...}'` | 410（Windows） | `search-expired` | 本机实测同类问题（见 0.2）：id 被改成 U+FFFD，查不到缓存。Linux/macOS 终端没有这个问题 | [ ] |
| 并发 3 个相同请求 | `for i in 1 2 3; do curl -s -X POST "$BASE/api/library" -H "$J" -d '{"manga_id":"-neg1x","source":"dgmanga","submit_sign":"1"}' & done; wait` | 200 ×1，409 ×2 | 一个 `added`，两个 `already-in-library` | 实测；库文件里只有一条 `-neg1x`，只入队一次 | [ ] |
| 删除后再添加 | 删除 → 重新搜索 → 添加 | 200 | `added`，`add_date` 是新的 | 依据代码 | [ ] |
| 添加后立即删除 | 添加 → 马上 DELETE | 409 或 200 | 如果任务还在队列里是 `manga-busy` | 实测同类情况见 4.6 | [ ] |
| 封面目录不可写 | 真实环境 `chmod a-w` 封面目录 | 500 | `{"code":500,"error":"internal-error"}`（无 `message`） | 未实测，依据过滤器。检查库文件没有新增记录 | [ ] |
| 恶意 JSON | 见 0.5 | 404（实测） | 见 0.5 | — | [ ] |

<a id="get-thumbnail"></a>
### 4.3 `GET /api/library/:mangaId/thumbnail`

- 用途：库中漫画的封面，读 `THUMBNAILS_DIR/<manga_id>.jpg`。🔒：否。先检查库里有没有这个 id，再检查文件在不在、是否在封面目录内。

```bash
curl -sS -o t.jpg -w 'HTTP %{http_code} %{content_type} %{size_download}B\n' "$BASE/api/library/img2/thumbnail"
```

真实响应（实测，假抓取器）：

```
HTTP 200 image/jpeg 68B
```

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| id 以 `-` 开头 | `.../library/-neg1/thumbnail` | 200 | `image/jpeg` | 实测 | [ ] |
| 不在库里的 id | `.../library/nope/thumbnail` | 404 | `{"code":404,"error":"thumbnail-not-found"}` | 实测 | [ ] |
| 在库里但文件被删了 | 手动删 `THUMBNAILS_DIR/-neg1x.jpg` 后请求 | 404 | 同上 | 实测 | [ ] |
| 旧记录 | 配置 B 预置的 `old1`，手动放了 `old1.jpg` | 200 | `image/jpeg` | 实测 | [ ] |
| 编码的路径穿越 | `.../library/..%2F..%2Fetc%2Fpasswd/thumbnail` | 404 | `{"code":404,"error":"thumbnail-not-found"}` | 实测；不泄露文件 | [ ] |
| 字面 `..`（curl 会规范化） | `c "$BASE/api/library/../config/thumbnail"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/config/thumbnail"}` | 实测；curl 把路径变成了 `/api/config/thumbnail` | [ ] |
| 字面 `..`，不规范化 | `c --path-as-is "$BASE/api/library/../config/thumbnail"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/library/../config/thumbnail"}` | 实测 | [ ] |
| 穿越到仓库文件 | `c --path-as-is "$BASE/api/library/..%2F..%2F..%2Fbackend%2Fpackage/thumbnail"` | 404 | `{"code":404,"error":"thumbnail-not-found"}` | 实测 | [ ] |
| `%2E%2E` | `.../library/%2E%2E/thumbnail` | 404 | `{"code":404,"error":"thumbnail-not-found"}` | 实测 | [ ] |
| 编码的 `/` | `.../library/a%2Fb/thumbnail` | 404 | `{"code":404,"error":"thumbnail-not-found"}` | 实测 | [ ] |
| 空 id | `.../library//thumbnail` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/library//thumbnail"}` | 实测 | [ ] |
| 很长的 id（5000 字符） | `.../library/$(printf 'x%.0s' $(seq 1 5000))/thumbnail` | 404 | `thumbnail-not-found` | 实测 | [ ] |
| 极长的 id（20 000 字符） | 同上 20000 | 431 | 无 JSON 信封 | 实测；Node 拒绝过长的请求行 | [ ] |
| Unicode id（已删除） | `.../library/%E6%BC%AB%E7%94%BB%E4%B8%83/thumbnail` | 404 | `thumbnail-not-found` | 实测（删除后）；删除前应是 200 | [ ] |
| Flask 版旧封面 | 生产库副本 | 200 | 真实封面 | 未实测，见清单 1.2 | [ ] |

<a id="get-library-chapters"></a>
### 4.4 `GET /api/library/:mangaId/chapters`

- 用途：库中漫画在源站的章节列表（重下选择用）。🔒：否。按记录的 `source` 实时抓取；磁盘、队列：无。

```bash
c "$BASE/api/library/img2/chapters"
```

真实响应（实测，假抓取器）：

```
{"code":200,"data":[{"index":1,"title":"第1话","url":"http://127.0.0.1:5462/ch/img2/1"},{"index":2,"title":"第2话","url":"http://127.0.0.1:5462/ch/img2/2"}]}
HTTP 200 application/json; charset=utf-8
```

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 真实漫画 | 真实 id | 200 | 与 3.5 结果相同 | 未实测 | [ ] |
| 没有章节 | `.../library/-neg1/chapters` | 200 | `{"code":200,"data":[]}` | 实测 | [ ] |
| 不在库里 | `.../library/nope/chapters` | 404 | `{"code":404,"error":"manga-not-found","message":"Unknown manga: nope"}` | 实测；不启动子进程 | [ ] |
| 记录的源未注册 | 库文件里一条 `"source":"nosuch"`（配置 B 预置 `src1`） | 404 | `{"code":404,"error":"unknown-source","message":"Unknown manga source: 'nosuch'. Registered: dgmanga"}` | 实测 | [ ] |
| Cloudflare | `.../library/cf4/chapters` | 502 | `{"code":502,"error":"scraper-blocked","message":"Source is behind a Cloudflare challenge"}` | 实测 | [ ] |
| DMCA | 库里一部被下架的漫画 | 451 | `dmca` | 未单独实测（3.5 实测了同一映射）；库记录不会因此被删 | [ ] |
| 抓取进程失败 / 超时 | 真实环境 `PYTHON_TIMEOUT_MS=1` | 502 | `scraper-failed` | 未单独实测 | [ ] |
| 编码的 `/` | `.../library/a%2Fb/chapters` | 404 | `manga-not-found`，`message` 为 `Unknown manga: a/b` | 依据 4.6 同类实测 | [ ] |

<a id="post-auto-update"></a>
### 4.5 `POST /api/library/:mangaId/auto-update` — 切换自动更新

- 用途：在 0（开启）和 1（暂停）之间切换 `download_switch`，写库文件。🔒：否。没有请求体。**不推送任何 Socket 事件**。

```bash
c -X POST "$BASE/api/library/img2/auto-update"
```

真实响应（实测，连续两次）：

```
{"code":200,"data":{"currentDownloadStatus":1}}
{"code":200,"data":{"currentDownloadStatus":0}}
```

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 切换两次 | 连发两次 | 200 | 1 然后 0 | 实测；**不幂等**，每次都翻转。日志 `download_switch for img2 -> 1` | [ ] |
| 库文件被写入 | 切换后看库文件 | — | `"download_switch": 1` | 实测 | [ ] |
| 不在库里 | `.../library/nope/auto-update` | 404 | `{"code":404,"error":"manga-not-found","message":"Unknown manga: nope"}` | 实测 | [ ] |
| 带了请求体 | `-H "$J" -d '{"download_switch":1}'` | 200 | 照样翻转（实测从 0 变 1），请求体被忽略 | 实测 | [ ] |
| GET | `c "$BASE/api/library/img2/auto-update"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/library/img2/auto-update"}` | 实测 | [ ] |
| id 以 `-` 开头 | `.../library/-neg1/auto-update` | 200 | `{"code":200,"data":{"currentDownloadStatus":1}}` | 实测 | [ ] |
| 首次下载完成时被覆盖 | 新加的漫画在首次下载完成前切换 | — | 首次完成时 `download_switch` 被设为源站的 `serialization` | 依据代码（`runFullManga`）。确认是否符合预期 | [ ] |
| 关掉后不再被扫描 | 已下完的漫画切到 1，重启 | — | 日志 `<名字>: completed series, skip` | 依据代码，见清单 3.3 | [ ] |
| 不需要口令 | 配置 A 不带口令 | 200 | — | 实测 | [ ] |

<a id="delete-library"></a>
### 4.6 `DELETE /api/library/:mangaId` 🔒 — 删除漫画及下载目录

- 做什么：口令检查 → 是否在下载或排队（409）→ 删除 `DOWNLOAD_ROOT/<名字>$<id>` 整个目录 → 删库记录 → 删封面文件。
- 检查顺序（实测）：口令（401）最先，然后 409，然后 404/500。

```bash
c -X DELETE "$BASE/api/library/-neg1x" -H "X-Admin-Token: $TOKEN"
```

真实响应（实测）：

```
{"code":200,"data":true}
HTTP 200 application/json; charset=utf-8
```

之后还要检查：库文件里没有这条；`THUMBNAILS_DIR/-neg1x.jpg` 没了；下载目录没了；日志 `=== MANGA DELETED: 测试漫画一! (-neg1x) ===`。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 不带口令 | 去掉 `-H "X-Admin-Token: ..."` | 401 | `{"code":401,"error":"admin-token-required","message":"This server requires the X-Admin-Token header"}` | 实测；什么都没删 | [ ] |
| 空口令 | `-H 'X-Admin-Token;'`（curl 发送空值的写法） | 401 | 同上 | 实测 | [ ] |
| 错误口令 | `-H 'X-Admin-Token: wrong'` | 401 | `{"code":401,"error":"admin-token-invalid"}` | 实测；没有 `message` | [ ] |
| 口令大小写不同 | 口令改成大写 | 401 | `admin-token-invalid` | 实测；口令区分大小写 | [ ] |
| 请求头名小写 | `-H "x-admin-token: $TOKEN"` | 正常处理 | — | 实测；头名不区分大小写 | [ ] |
| 口令前后有空格 | `-H "X-Admin-Token:  $TOKEN "` | 200 | `{"code":200,"data":true}` | 实测；HTTP 层去掉了前后空白 | [ ] |
| 不带口令、id 也不存在 | `c -X DELETE "$BASE/api/library/nope"` | 401 | `admin-token-required` | 实测；口令先于存在性检查 | [ ] |
| 没设 `ADMIN_TOKEN` | 配置 B，不带头 | 200 | `{"code":200,"data":true}` | 实测 | [ ] |
| 没设 `ADMIN_TOKEN`，带任意头 | 配置 B，`-H 'X-Admin-Token: anything'` | 200 | 正常 | 实测（在 4.7 上测的，同一个守卫） | [ ] |
| 不存在的 id | `.../library/nope` 带口令 | 404 | `{"code":404,"error":"manga-not-found","message":"Unknown manga: nope"}` | 实测 | [ ] |
| 重复删除 | 同一请求再发一次 | 404 | `{"code":404,"error":"manga-not-found","message":"Unknown manga: -neg1x"}` | 实测 | [ ] |
| 正在下载 | 对运行中任务的漫画删除 | 409 | `{"code":409,"error":"manga-busy","message":"Manga is downloading or queued"}` | 实测（`img2` 运行中）；什么都没删 | [ ] |
| 在队列里等待 | 对排队中的漫画删除 | 409 | 同上 | 实测（`slow3` 排队中） | [ ] |
| 下载目录删不掉 | 本机：`icacls "<某个 zip>" /deny "%USERNAME%:(D)"` 后删除；Linux：`docker exec -u root <容器> chmod a-w "<下载目录>/<名字>\$<id>/<名字>"` | 500 | `{"code":500,"error":"delete-failed","message":"Could not remove the download folder; record kept"}` | 实测（Windows 权限）：记录和封面保留，**但目录已被部分删除**（`第2话.zip` 没了，被锁的 `第1话.zip` 还在）。日志 `Failed to remove manga folder ...`。Linux 未实测 | [ ] |
| 恢复权限后再删 | 去掉 deny 后重发 | 200 | `data: true` | 依据代码 | [ ] |
| 没有下载目录的漫画 | 删一部没下过章节的（`-neg1x`、`old1`） | 200 | `data: true` | 实测 | [ ] |
| Unicode id | `.../library/%E6%BC%AB%E7%94%BB%E4%B8%83` 带口令 | 200 | `data: true` | 实测；`漫画七.jpg` 被删 | [ ] |
| 编码的 `/` | `.../library/a%2Fb` 带口令 | 404 | `{"code":404,"error":"manga-not-found","message":"Unknown manga: a/b"}` | 实测 | [ ] |
| 没有 id | `c -X DELETE "$BASE/api/library" -H "X-Admin-Token: $TOKEN"` | 404 | `{"code":404,"error":"not-found","message":"Cannot DELETE /api/library"}` | 实测 | [ ] |
| 结尾斜杠 | `.../library/` | 404 | `{"code":404,"error":"not-found","message":"Cannot DELETE /api/library/"}` | 实测 | [ ] |
| 名字带 `/` 的漫画 | 真实环境 | 200 | — | 未实测；目录是 `名字-带横线$id`，确认被删 | [ ] |
| 删除后下载任务不再创建目录 | 删除和入队同时发生 | — | 不留孤儿目录 | 依据代码（`deleting` 集合）；见清单 1.6 | [ ] |
| 日志不含口令 | 做完上面所有行后 `grep` 日志 | — | 日志里找不到口令字符串 | 实测：日志只有 `admin-token-invalid` 等错误码 | [ ] |

<a id="post-rezip"></a>
### 4.7 `POST /api/library/rezip` 🔒 — 全盘重新打包

- 做什么：排入一个 `rezip` 任务。任务遍历 `DOWNLOAD_ROOT`，把还没打包的章节文件夹打成 zip；结束时推送 `scan_completed`。已有 rezip 在排队或运行时返回同一个 `taskId`。

```bash
c -X POST "$BASE/api/library/rezip" -H "X-Admin-Token: $TOKEN"
```

真实响应（实测）：

```
{"code":200,"data":{"taskId":"8f4336f1-f641-4329-a829-ec51cf502988"}}
HTTP 200 application/json; charset=utf-8
```

实测前手动放了一个文件夹 `有图漫画$img2/有图漫画/第9话/001.jpg`，任务结束后变成 `第9话.zip`，日志 `Rezip done: scanned 2 manga, zipped 1 chapters, skipped 0, errors 0`。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 不带口令 | 去掉口令头 | 401 | `{"code":401,"error":"admin-token-required","message":"This server requires the X-Admin-Token header"}` | 实测；不入队 | [ ] |
| 错误口令 | `-H 'X-Admin-Token: wrong'` | 401 | `{"code":401,"error":"admin-token-invalid"}` | 实测 | [ ] |
| 没设 `ADMIN_TOKEN` | 配置 B 不带头 | 200 | `{"code":200,"data":{"taskId":"9a1a537c-bd94-46bf-a15c-3075f300199a"}}` | 实测 | [ ] |
| 没设 `ADMIN_TOKEN`，带任意头 | 配置 B，`-H 'X-Admin-Token: anything'` | 200 | 新的 `taskId` | 实测 | [ ] |
| 前一个还在排队时再发 | 先让一个慢任务运行，连发两次 rezip | 200 ×2 | 两次 `taskId` 相同（实测 `0a660e0d-...`） | 实测；日志第二次是 `De-duplicated task[rezip]` | [ ] |
| 前一个已结束再发 | 小库上连发两次（任务约 1 毫秒结束） | 200 ×2 | 两个不同的 `taskId` | 实测（`8f4336f1-...`、`fad187ed-...`）。去重只对排队/运行中的任务生效 | [ ] |
| 推送 | 观察 Socket | — | `queue_updated`（入队）→ `queue_updated`（运行）→ `scan_completed`（无载荷）→ `queue_updated`（结束） | 实测 | [ ] |
| 已有 zip 不变 | 对比任务前后 zip 的修改时间 | — | 未变 | 实测（`第1话.zip` 保留） | [ ] |
| 下载目录不存在 | 配置 B 新数据目录 | 200 | 正常 `taskId` | 实测；日志 `WARN [FilesystemService] listDir failed ... ENOENT`，任务照常结束并推送 `scan_completed` | [ ] |
| GET | `c "$BASE/api/library/rezip"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/library/rezip"}` | 实测 | [ ] |
| 真实大库 | 生产下载目录副本 | 200 | — | 未实测，见清单 1.6、3.4 | [ ] |

---

<a id="download-section"></a>
## 5. 下载队列

队列单并发、先进先出，每次变化都写 `queue.json`（与库文件同目录，或 `QUEUE_FILE`）并推送 `queue_updated`。

<a id="post-download"></a>
### 5.1 `POST /api/download` — 排入全量下载

- 做什么：同一部漫画已有排队或运行中的 `full-manga` 时返回那个任务；否则新建。任务从 `last_epi + 1` 下载新章节（从未下载过的从第 1 话开始），每章一个 zip：`DOWNLOAD_ROOT/<名字>$<id>/<名字>/<章节名>.zip`。🔒：否。

```bash
c -X POST "$BASE/api/download" -H "$J" -d '{"manga_id":"img2"}'
```

真实响应（实测）：

```
{"code":200,"data":{"taskId":"3ab390f0-78d6-4456-b0ac-5301cd689738"}}
HTTP 200 application/json; charset=utf-8
```

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 有新章节 | 新添加的 `img2`（源站 2 章） | 200 | `taskId` | 实测：生成 `第1话.zip`、`第2话.zip`；`last_epi` 变 2；Socket 事件见第 10 节 | [ ] |
| 已是最新 | 已下完的 `img2` 再发 | 200 | 新 `taskId` | 实测：`download_started` → `download_completed`（`chapters_total: 0`），没有 `download_progress`；`updated_at` 不变 | [ ] |
| 源站章节数少于 `last_epi` | 新添加且源站 0 章 | 200 | `taskId` | 依据代码：日志 `nothing to download (up to date)`，**不发** `download_started` | [ ] |
| 正在运行时重复提交 | 对运行中的 `img2` 再发 | 200 | 与运行中的任务相同的 `taskId`（实测 `69374de6-...`） | 实测；日志 `De-duplicated task[full-manga, img2]` | [ ] |
| 排队时重复提交 | 对排队中的 `slow3` 再发 | 200 | 与排队中的相同（实测 `7ef0cc3c-...`） | 实测；队列里仍只有一个 | [ ] |
| 不在库里 | `{"manga_id":"nope"}` | 404 | `{"code":404,"error":"manga-not-found","message":"Unknown manga: nope"}` | 实测；不入队 | [ ] |
| 路径样的 id | `{"manga_id":"../etc"}` | 404 | `{"code":404,"error":"manga-not-found","message":"Unknown manga: ../etc"}` | 实测 | [ ] |
| 缺字段 | `-d '{}'` | 400 | `{"code":400,"error":"validation-failed","message":"manga_id should not be empty; manga_id must be a string"}` | 实测 | [ ] |
| 空字符串 | `{"manga_id":""}` | 400 | `{"code":400,"error":"validation-failed","message":"manga_id should not be empty"}` | 实测 | [ ] |
| 类型不对 | `{"manga_id":42}` | 400 | `{"code":400,"error":"validation-failed","message":"manga_id must be a string"}` | 实测 | [ ] |
| 多余字段 | `{"manga_id":"img2","chapters":[1],"x":1}` | 200 | `taskId` | 实测；多余字段被忽略，仍是全量下载 | [ ] |
| 记录的源未注册 | 配置 B 的 `src1` | 200 | `{"code":200,"data":{"taskId":"2fb86948-..."}}` | 实测：接口成功，任务随后失败，日志 `task[full-manga, src1] failed: Unknown manga source: 'nosuch'. Registered: dgmanga`；推送 `queue_updated` ×3，**没有** `download_started`/`download_completed` | [ ] |
| Cloudflare 拦截章节列表 | 添加 `cf4` | 200 | — | 实测：`download_started` → `download_completed`（`status:"failed"`、`chapters_total:0`），没有 `download_progress` | [ ] |
| 源站 DMCA | 添加 `dmca5` | 200 | — | 实测：只推送 `dmca_alert`（`{"manga_id":"dmca5","manga_name":"下架漫画"}`），没有 `download_started`；记录和封面被删 | [ ] |
| 所有章节失败 | 添加 `fail6` | 200 | — | 实测：`download_completed` 的 `status:"failed"`、`chapters_failed:1`；`completed` 仍为 `false`；留下空目录 `全失败漫画$fail6/全失败漫画` | [ ] |
| 章节图片抓取超时 | 添加 `slow3`（每章 25 秒，`PYTHON_TIMEOUT_MS=8000`） | 200 | — | 实测：每章约 8 秒后失败，日志 `Chapter '第1话' failed: Python CLI timed out after 8000ms`；整体 `status:"failed"` | [ ] |
| 真实源站 429 | 真实环境大批量下载 | 200 | — | 未实测；日志应有 `page rate limited (429); retrying in Ns`，见清单 1.4 | [ ] |
| 名字带 `/` | 真实环境 | 200 | — | 未实测；目录是 `名字-带横线$id` | [ ] |
| Kavita 扫描 | 配了 Kavita，任务完成后 | — | — | 实测，假 Kavita：收到 `POST /api/Library/scan-folder {"apiKey":"...","folderPath":"/manga/有图漫画$img2"}`，日志 `Kavita scan triggered for img2` | [ ] |

<a id="post-download-chapters"></a>
### 5.2 `POST /api/download/chapters` — 重下指定章节

- 做什么：同一部漫画已有**排队中**的 `redownload` 时，把新章节按 `url` 去重并入，返回那个任务（运行中的不合并，新建一个）。重下覆盖同名 zip，不改变 `last_epi`。🔒：否。
- 章节字段只校验类型（`index` 整数、`title` 字符串、`url` 字符串），不校验内容。

```bash
printf '%s' '{"manga_id":"img2","chapters":[{"index":2,"title":"第2话","url":"http://127.0.0.1:5462/ch/img2/2"}]}' > redl.json
c -X POST "$BASE/api/download/chapters" -H "$J" --data-binary @redl.json
```

真实响应（实测）：

```
{"code":200,"data":{"taskId":"8d890c7c-533b-485a-af1d-7abb1756a2ef"}}
HTTP 200 application/json; charset=utf-8
```

真实环境里 `chapters` 用 4.4 返回的元素原样回传。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 覆盖已有 zip | 重下 `第1话` | 200 | `taskId` | 实测；`last_epi` 不变（`chapter_completed` 里 `last_epi:2`），`updated_at` 更新 | [ ] |
| 两次提交不同章节，第一个还在排队 | 先提交第 1 话，再提交第 1、2 话 | 200 ×2 | 两次 `taskId` 相同（实测 `391a4112-...`） | 实测；`queue.json` 里该任务有 2 个章节；第二次也推送了 `queue_updated`（快照和上一次相同） | [ ] |
| 第一个已经在运行 | 运行中再提交 | 200 | 新 `taskId` | 依据代码（运行中的章节列表已固定） | [ ] |
| 缺 `chapters` | `{"manga_id":"img2"}` | 400 | `{"code":400,"error":"validation-failed","message":"chapters must contain at least 1 elements; chapters must be an array"}` | 实测 | [ ] |
| 空数组 | `"chapters":[]` | 400 | `{"code":400,"error":"validation-failed","message":"chapters must contain at least 1 elements"}` | 实测 | [ ] |
| 不是数组 | `"chapters":"all"` | 400 | `{"code":400,"error":"validation-failed","message":"chapters must contain at least 1 elements; chapters must be an array; each value in nested property chapters must be either object or array"}` | 实测 | [ ] |
| 元素是空对象 | `"chapters":[{}]` | 400 | `{"code":400,"error":"validation-failed","message":"chapters.0.index must be an integer number; chapters.0.title must be a string; chapters.0.url must be a string"}` | 实测 | [ ] |
| `index` 是字符串 | `{"index":"1","title":"t","url":"u"}` | 400 | `{"code":400,"error":"validation-failed","message":"chapters.0.index must be an integer number"}` | 实测 | [ ] |
| `index` 是小数 | `{"index":1.5,...}` | 400 | 同上 | 实测 | [ ] |
| 元素是 `null` | `"chapters":[null]` | 400 | `{"code":400,"error":"validation-failed","message":"chapters.each value in nested property chapters must be either object or array"}` | 实测 | [ ] |
| 元素有多余字段 | `{"index":1,"title":"t","url":"u","extra":"x"}` | 200 | `taskId` | 实测；生成 `t.zip`（标题就是 `t`） | [ ] |
| 负数 index、空标题、空 url | `{"index":-3,"title":"","url":""}` | 200 | `taskId` | 实测：日志 `Chapter -3: unusable title ""; using 第-3话`，生成 `第-3话.zip`（假抓取器对空 url 也给了图）。真实抓取器预计该章失败 | [ ] |
| 中文标题写在 `-d` 里（Windows） | `-d '{"...","title":"第2话",...}'` | 200 | `taskId` | 实测：生成 `��2��.zip`。用文件发送 | [ ] |
| 不在库里 | `{"manga_id":"nope","chapters":[{"index":1,"title":"t","url":"u"}]}` | 404 | `{"code":404,"error":"manga-not-found","message":"Unknown manga: nope"}` | 实测 | [ ] |
| 很长的章节列表（约 660 KB） | 0.5 的"接近 1 MB"行 | 404 | `manga-not-found`（id 不存在） | 实测；正常解析 | [ ] |
| 超过 1 MB | 0.5 的命令 | 实测 404，契约 413 | 见 0.5 | 见[第 11 节](#diff) 第 1 条 | [ ] |
| 源站 url 失效 | 真实环境用一个错的 url | 200 | — | 未实测；`download_completed` 应为 `failed`，不产生 zip | [ ] |

<a id="get-queue"></a>
### 5.3 `GET /api/download/queue`

- 用途：队列快照。🔒：否。只读内存。

```bash
c "$BASE/api/download/queue"
```

真实响应（实测，一个运行中 + 一个排队）：

```
{"code":200,"data":{"active":{"id":"69374de6-8c08-4363-8233-b56f24f21429","kind":"full-manga","mangaId":"img2","status":"running","enqueuedAt":1794731373226,"startedAt":1794731373226},"pending":[{"id":"7ef0cc3c-b1fb-483e-818f-dfb0916c4f82","kind":"full-manga","mangaId":"slow3","status":"pending","enqueuedAt":1794731373347}]}}
HTTP 200 application/json; charset=utf-8
```

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 空队列 | 无任务时 | 200 | `{"code":200,"data":{"active":null,"pending":[]}}` | 实测 | [ ] |
| rezip 任务 | 排队中的 rezip | 200 | 该项没有 `mangaId`：`{"id":"0a660e0d-...","kind":"rezip","status":"pending","enqueuedAt":1794731545560}` | 实测 | [ ] |
| redownload 任务 | 排队中的重下 | 200 | `"kind":"redownload"`；快照里**没有**章节列表 | 实测 | [ ] |
| 时间单位 | 看 `enqueuedAt` | — | 13 位毫秒 | 实测 | [ ] |
| 三个任务的顺序 | 连加三部 | 200 | 一个 `active`，两个 `pending`，按添加顺序 | 实测（`slow3` 运行，`redownload slow3`、`full-manga img2` 排队） | [ ] |
| 与 `queue.json` 一致 | 对比文件 | — | 文件里 `tasks` = active + pending，顺序相同 | 实测 | [ ] |
| 方法不对 | `c -X POST "$BASE/api/download/queue"` | 404 | `{"code":404,"error":"not-found","message":"Cannot POST /api/download/queue"}` | 依据同类实测 | [ ] |
| 多余路径段 | `c "$BASE/api/download/queue/x"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/download/queue/x"}` | 实测 | [ ] |

<a id="get-current"></a>
### 5.4 `GET /api/download/current`

- 用途：当前运行中的任务。🔒：否。

```bash
c "$BASE/api/download/current"
```

真实响应（实测，运行中）：

```
{"code":200,"data":{"id":"69374de6-8c08-4363-8233-b56f24f21429","kind":"full-manga","mangaId":"img2","status":"running","enqueuedAt":1794731373226,"startedAt":1794731373226}}
```

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 空闲 | 无任务时 | 200 | `{"code":200,"data":null}` | 实测 | [ ] |
| 与 queue 一致 | 同时请求 5.3 | 200 | 与 `queue.data.active` 相同 | 实测 | [ ] |
| rezip 运行中 | 大库上 rezip | 200 | 没有 `mangaId` | 依据代码 | [ ] |

<a id="restart"></a>
### 5.5 重启后的队列恢复

**实测与契约不一致**（见[第 11 节](#diff) 第 3 条）。

步骤（实测，假抓取器）：

1. 让 `slow3` 的 `full-manga` 处于运行中，再提交一个 `slow3` 的重下和一个 `img2` 的全量下载。`queue.json` 里有 3 个任务。
2. 强杀后端（`kill -9`，容器里用 `docker kill`）。
3. 用同一数据目录启动。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 队列文件被读取 | 看启动日志 | — | `Restored 3 task(s) from .../queue.json` | 实测 | [ ] |
| 恢复的任务真正执行 | 启动后 `c "$BASE/api/download/queue"` | 200 | 契约：被打断的 `slow3 full-manga` 在队首，后面是 `redownload slow3`、`full-manga img2` | **实测不符**：三个任务在库加载之前就开始运行，全部立刻失败，日志 `task[full-manga, slow3] failed: Unknown manga: slow3`（`redownload slow3`、`full-manga img2` 同样），然后才是 `Loaded 4 manga from ...`。之后只有启动扫描把未完成的 `slow3` 重新入队；**重下任务丢失** | [ ] |
| 真实环境复现 | 下载一部长漫画到一半 `docker restart` | — | — | 未实测于 Node 24 / 容器。看日志 `Restored N task(s)` 之后是否紧跟 `failed: Unknown manga` | [ ] |
| 重启后搜索缓存为空 | 重启后直接添加之前搜到的漫画 | 410 | `{"code":410,"error":"search-expired","message":"Candidate no longer in the search cache; search again"}` | 实测 | [ ] |
| 重启后已在库的漫画 | 重启后添加 `img2` | 409 | `already-in-library`，`kavita_url` 已由启动同步填上 | 实测 | [ ] |
| `queue.json` 损坏 | 把文件改成 `xx` 后启动 | — | 启动正常，文件被改名为 `queue.json.corrupt-<秒>`，队列为空 | 未实测，依据代码与清单 1.5 | [ ] |
| 重启时的 Socket | 客户端开着时重启 | — | 客户端 `disconnect`（`transport close`）→ 若干 `connect_error`（`websocket error`）→ `connect`（新 id） | 实测 | [ ] |

---

<a id="kavita-section"></a>
## 6. Kavita

本机用假 Kavita 实测（端口 5462；`alice`/`pw` 能登录，`crash` 让它返回 500）。真实 Kavita 的各项见清单 1.8。

<a id="post-kavita-login"></a>
### 6.1 `POST /api/kavita/login`

- 做什么：用 `KAVITA_BASE_URL` 调 Kavita 的 `POST /api/Account/login`（请求体 `{"username","password","apiKey":""}`），返回令牌和自动登录地址。🔒：否。不写磁盘。

```bash
c -X POST "$BASE/api/kavita/login" -H "$J" -d '{"username":"alice","password":"pw"}'
```

真实响应（实测，假 Kavita）：

```
{"code":200,"data":{"apiKey":"fake-api-key-123","jwt":"jwt-aaa","refreshToken":"rt-aaa","loginUrl":"http://127.0.0.1:5462/login?apiKey=fake-api-key-123"}}
HTTP 200 application/json; charset=utf-8
```

`loginUrl` = `KAVITA_EXPOSE_URL` + `/login?apiKey=` + Kavita 返回的 `apiKey`。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 真实 Kavita 正确账号 | 真实账号 | 200 | 同上形态 | 未实测。浏览器打开 `loginUrl` 应直接是登录状态 | [ ] |
| 密码错误 | `{"username":"alice","password":"bad"}` | 403 | `{"code":403,"error":"kavita-login-failed","message":"Kavita answered 401"}` | 实测，假 Kavita 返回 401。真实 Kavita 可能返回 400 或 401，`message` 随之变 | [ ] |
| 空用户名和密码 | `{"username":"","password":""}` | 403 | 同上 | 实测；空字符串通过校验，交给 Kavita 拒绝 | [ ] |
| Kavita 内部错误 | `{"username":"crash","password":"x"}` | 502 | `{"code":502,"error":"kavita-unreachable","message":"Kavita is unreachable or returned an error"}` | 实测；日志 `WARN [KavitaController] Kavita request failed: Request failed with status code 500` | [ ] |
| Kavita 连不上 | 配置 C：`KAVITA_BASE_URL=http://127.0.0.1:5463`（没人监听） | 502 | 同上 | 实测，0.07 秒返回；日志 `Kavita request failed: connect ECONNREFUSED 127.0.0.1:5463`；**响应里不含地址** | [ ] |
| Kavita 不响应（挂起） | 真实环境：Kavita 机器丢包，或指向一个不回包的地址 | 502（约 15 秒后） | 同上 | 未实测，依据 `kavita.module.ts` 的 `timeout: 15_000` | [ ] |
| Kavita 未启用 | 配置 B | 404 | `{"code":404,"error":"kavita-disabled","message":"Kavita is not configured on this server"}` | 实测 | [ ] |
| Kavita 未启用 + 缺字段 | 配置 B，`-d '{}'` | 400 | `validation-failed` | 实测：校验先于启用检查 | [ ] |
| 缺密码 | `{"username":"alice"}` | 400 | `{"code":400,"error":"validation-failed","message":"password must be a string"}` | 实测 | [ ] |
| 两个都缺 | `-d '{}'` | 400 | `{"code":400,"error":"validation-failed","message":"username must be a string; password must be a string"}` | 实测 | [ ] |
| 类型不对 | `{"username":1,"password":true}` | 400 | 同上 | 实测 | [ ] |
| 试图注入 `apiKey` | `{"username":"alice","password":"pw","apiKey":"inject"}` | 200 | 正常 | 实测；假 Kavita 收到的仍是 `"apiKey":""` | [ ] |
| GET | `c "$BASE/api/kavita/login"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/kavita/login"}` | 实测 | [ ] |
| 日志不含密码 | 登录后 `grep pw` 日志 | — | 找不到 | 实测：后端日志不记录请求体 | [ ] |
| 启动时同步 | 配了 Kavita 启动 | — | 日志 `Kavita lib sync: updated N entries`；匹配到的漫画 `kavita_url` 被填上 | 实测（`updated 1 entries`，`img2` 的 `kavita_url` 变为 `http://127.0.0.1:5462/library/1/series/42`） | [ ] |
| 启动时 Kavita 连不上 | 配置 C 启动 | — | 日志 `ERROR [KavitaService] Kavita auth failed: connect ECONNREFUSED ...`；后端照常启动 | 实测 | [ ] |

<a id="post-kavita-refresh"></a>
### 6.2 `POST /api/kavita/refreshtoken`

- 做什么：调 Kavita 的 `POST /api/Account/refresh-token`（请求体 `{"token","refreshToken"}`）。**注意：代码用的是 `KAVITA_EXPOSE_URL`，不是 `KAVITA_BASE_URL`**（见[第 11 节](#diff) 第 7 条）。🔒：否。

```bash
c -X POST "$BASE/api/kavita/refreshtoken" -H "$J" -d '{"jwt":"jwt-aaa","refreshToken":"rt-aaa"}'
```

真实响应（实测，假 Kavita）：

```
{"code":200,"data":{"jwt":"jwt-bbb","refreshToken":"rt-bbb"}}
HTTP 200 application/json; charset=utf-8
```

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 真实 Kavita | 用 6.1 拿到的 `jwt`、`refreshToken` | 200 | 新令牌 | 未实测。若 `KAVITA_EXPOSE_URL` 从容器里访问不到，这里会是 502 | [ ] |
| 令牌无效 | `{"jwt":"old","refreshToken":"bad"}` | 403 | `{"code":403,"error":"kavita-refresh-failed","message":"Kavita answered 400"}` | 实测，假 Kavita 返回 400 | [ ] |
| 缺 `refreshToken` | `{"jwt":"jwt-aaa"}` | 400 | `{"code":400,"error":"validation-failed","message":"refreshToken must be a string"}` | 实测 | [ ] |
| Kavita 连不上 | 配置 C | 502 | `{"code":502,"error":"kavita-unreachable","message":"Kavita is unreachable or returned an error"}` | 实测 | [ ] |
| Kavita 未启用 | 配置 B | 404 | `{"code":404,"error":"kavita-disabled","message":"Kavita is not configured on this server"}` | 实测 | [ ] |
| 同一刷新令牌用两次 | 真实 Kavita | 第二次 403 或 200 | 记录实际结果 | 未实测，取决于 Kavita | [ ] |

---

<a id="non-api"></a>
## 7. 非 API 路由

<a id="static"></a>
### 7.1 静态文件（`frontend/dist`）

```bash
A=$(curl -s "$BASE/" | grep -o 'assets/index-[^"]*\.js' | head -1)
curl -sS -o /dev/null -w 'HTTP %{http_code} %{content_type} %{size_download}B\n' "$BASE/$A"
```

真实响应（实测）：`HTTP 200 text/javascript; charset=utf-8`；响应头有 `ETag`、`Last-Modified`、`Cache-Control: public, max-age=0`。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 存在的资源 | 如上 | 200 | JS 内容 | 实测 | [ ] |
| HEAD | `curl -sI "$BASE/$A"` | 200 | 无响应体 | 实测 | [ ] |
| `favicon.ico` | `curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "$BASE/favicon.ico"` | 200 | `image/vnd.microsoft.icon`，15086 字节 | 实测 | [ ] |
| 不存在的资源 | `curl -sS -w '\n%{http_code} %{content_type}\n' "$BASE/assets/nope.js"` | **实测 200 `text/html`**（返回 `index.html`）；`frontend-static.e2e-spec.ts` 期望 404 | — | **与测试期望不一致**，见[第 11 节](#diff) 第 2 条 | [ ] |
| 不存在的图片 | `.../nope.png` | 实测 200 `text/html` | `index.html` | 同上 | [ ] |
| `frontend/dist` 不存在 | 删掉构建产物后启动 | — | 记录实际结果 | 未实测 | [ ] |

<a id="spa"></a>
### 7.2 SPA 回退

`spaFallback` 对没有扩展名、不以 `/api/` 或 `/socket.io` 开头的 GET 返回 `index.html`。

```bash
c "$BASE/settings" | head -3
```

真实响应（实测）：

```
<!DOCTYPE html>
<html lang="zh-CN" class="dark">
  <head>
HTTP 200 text/html; charset=utf-8
```

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 根路径 | `c "$BASE/"` | 200 | `index.html`（518 字节） | 实测 | [ ] |
| 旧书签 | `c "$BASE/mainpage/mangaku"` | 200 | `index.html` | 实测；浏览器里应跳到漫画库 | [ ] |
| 深层路径 | `c "$BASE/some/deep/route"` | 200 | `index.html` | 实测 | [ ] |
| HEAD | `curl -sI "$BASE/settings"` | 200 | 无响应体 | 实测 | [ ] |
| POST | `c -X POST "$BASE/settings"` | 404 | `{"code":404,"error":"not-found","message":"Cannot POST /settings"}` | 实测 | [ ] |
| 不带斜杠的 `/api` | `c "$BASE/api"` | 实测 200 `text/html` | `index.html` | 实测；`/api` 不以 `/api/` 开头，被当成页面路由。见[第 11 节](#diff) 第 5 条 | [ ] |

<a id="docs"></a>
### 7.3 `GET /api/docs`、`GET /api/docs-json`

Swagger 界面和 OpenAPI 文档，由 `main.ts` 注册（e2e 测试的启动方式不注册，`frontend/e2e/start-backend.cjs` 的非 `E2E_BACKEND_MAIN` 方式也不注册）。

```bash
c "$BASE/api/docs" | head -5
c "$BASE/api/docs-json" | head -c 300
```

真实响应（实测）：`/api/docs` 是 `HTTP 200 text/html`，标题 `Swagger UI`；`/api/docs-json` 是 `HTTP 200 application/json`，8013 字节，`info.title` 为 `VanManga API`、`version` 为 `0.2.0`，`paths` 里正好是第 1 节的 20 个 API 路由。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 界面能用 | 浏览器打开 `$BASE/api/docs` | 200 | 能看到五个分组（config、library、download、scraper、kavita） | 实测（curl）；浏览器里用 Authorize 填 `admin-token` 后试删除 | [ ] |
| 结尾斜杠 | `c "$BASE/api/docs/"` | 200 | `text/html` | 实测 | [ ] |
| 不含旧接口 | 在 `docs-json` 里找 `dogemanga`、`short`、`paginate` | — | 找不到 | 实测 | [ ] |
| 生产环境是否该开放 | — | — | — | 确认是否需要在公网上关掉 `/api/docs`（当前总是开放，不受口令保护） | [ ] |

<a id="unknown-api"></a>
### 7.4 未知的 `/api/*`

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 未知路由 | `c "$BASE/api/no-such-route"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/no-such-route"}` | 实测；不会回退到 `index.html` | [ ] |
| `/api/` | `c "$BASE/api/"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/"}` | 实测 | [ ] |
| 未知路由的 POST | `c -X POST "$BASE/api/no-such-route"` | 404 | `{"code":404,"error":"not-found","message":"Cannot POST /api/no-such-route"}` | 依据同类实测 | [ ] |
| 跨域预检（没设 `CORS_ORIGINS`） | 见第 9 节 | 404 | `{"code":404,"error":"not-found","message":"Cannot OPTIONS /api/library"}` | 实测 | [ ] |

<a id="socketio-http"></a>
### 7.5 `/socket.io/`（HTTP 握手）

```bash
c "$BASE/socket.io/?EIO=4&transport=polling"
```

真实响应（实测）：

```
0{"sid":"B2EgztKdGfDw02r6AAAC","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}
HTTP 200 text/plain; charset=UTF-8
```

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 缺参数 | `c "$BASE/socket.io/"` | 400 | `{"code":0,"message":"Transport unknown"}`（Engine.IO 自己的格式，不是 API 信封） | 实测 | [ ] |
| 经反向代理 | 真实环境经 Nginx | 200，且能升级到 WebSocket | — | 未实测，见清单 2.9 | [ ] |

---

<a id="removed"></a>
## 8. 已删除的旧接口

全部应返回 404 `not-found`（契约第 5 节）。

| 场景 | 请求 | 预期状态码 | 预期响应体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 旧搜索 | `c "$BASE/api/dogemanga/search?q=x"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/dogemanga/search?q=x"}` | 实测 | [ ] |
| 旧封面 | `c "$BASE/api/dogemanga/thumbnail?mid=img2"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/dogemanga/thumbnail?mid=img2"}` | 实测 | [ ] |
| 旧库列表 | `c "$BASE/api/dogemanga/manga"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/dogemanga/manga"}` | 实测 | [ ] |
| 旧添加 | `c -X POST "$BASE/api/dogemanga/add" -H "$J" -d '{}'` | 404 | `{"code":404,"error":"not-found","message":"Cannot POST /api/dogemanga/add"}` | 实测 | [ ] |
| 旧删除 | `c -X DELETE "$BASE/api/dogemanga/img2"` | 404 | `{"code":404,"error":"not-found","message":"Cannot DELETE /api/dogemanga/img2"}` | 实测；记录没被删 | [ ] |
| Kavita 状态 | `c "$BASE/api/kavita/status"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/kavita/status"}` | 实测 | [ ] |
| Kavita 状态 POST | `c -X POST "$BASE/api/kavita/status"` | 404 | `{"code":404,"error":"not-found","message":"Cannot POST /api/kavita/status"}` | 实测 | [ ] |
| `library/short` | `c "$BASE/api/library/short"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/library/short"}` | 实测 | [ ] |
| `library/search` | `c "$BASE/api/library/search?q=x"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/library/search?q=x"}` | 实测 | [ ] |
| `library/paginate` | `c "$BASE/api/library/paginate?page=1"` | 404 | `{"code":404,"error":"not-found","message":"Cannot GET /api/library/paginate?page=1"}` | 实测 | [ ] |
| `/js/config.js` | `c "$BASE/js/config.js"` | 契约 404 | **实测 200 `text/html`，返回 `index.html`** | **与契约不一致**，见[第 11 节](#diff) 第 2 条。至少确认响应里没有 `window.MANGA_BASE_URL` | [ ] |
| 旧环境变量无效 | 设 `MANGA_BASE_URL=http://x` 启动 | — | 行为不变 | 依据代码（不再读取） | [ ] |
| 旧 Socket 事件 | 见第 10 节 | — | 永远收不到 `downloading_info`、`response`、`complete_info` | 实测：整个测试过程中 `onAny` 没收到这三个 | [ ] |

---

<a id="cors"></a>
## 9. 跨域（CORS）

`curl` 不受浏览器同源策略约束，所以这里检查的是**响应头**；浏览器里真正拦没拦，按清单 1.11 用另一个域名的网页 `fetch` 一次。

```bash
curl -s -D - -o /dev/null "$BASE/api/library" -H 'Origin: https://a.example' | grep -iE '^HTTP|access-control'
curl -s -D - -o /dev/null -X OPTIONS "$BASE/api/library/x" -H 'Origin: https://a.example' \
  -H 'Access-Control-Request-Method: DELETE' -H 'Access-Control-Request-Headers: x-admin-token,content-type' | grep -iE '^HTTP|access-control'
curl -s -D - -o /dev/null "$BASE/socket.io/?EIO=4&transport=polling" -H 'Origin: https://a.example' | grep -iE '^HTTP|access-control'
```

| 场景 | 请求 | 预期状态码 | 预期响应头 / 体 | 还要检查什么 | ✓ |
|---|---|---|---|---|---|
| 没设 `CORS_ORIGINS`，普通 GET | 第一条，Origin 任意 | 200 | 没有任何 `Access-Control-*` 头 | 实测（配置 B）；浏览器读不到响应 | [ ] |
| 没设，预检 | 第二条 | 404 | `{"code":404,"error":"not-found","message":"Cannot OPTIONS /api/library"}`，无 CORS 头 | 实测；浏览器不会发出真正的 DELETE | [ ] |
| 没设，Socket 轮询 | 第三条 | 200 | 无 `Access-Control-*` 头 | 实测；浏览器的轮询传输读不到 | [ ] |
| 没设，Socket WebSocket | 另一个域名的网页里 `io('<后端>', {transports:['websocket']})` | 能连上 | — | 实测（Node 客户端带 `Origin: http://evil.example` 连上了）。服务端不检查 WebSocket 的 Origin，浏览器也不对 WebSocket 做 CORS，所以别的网站能收到推送（只读，不能操作）。见[第 11 节](#diff) 第 6 条 | [ ] |
| 设了，允许的来源 | 配置 C，Origin `https://a.example` | 200 / 204 / 200 | `Access-Control-Allow-Origin: https://a.example`、`Access-Control-Allow-Credentials: true`；预检另有 `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`、`Access-Control-Allow-Headers: x-admin-token,content-type` | 实测 | [ ] |
| 设了，列表里第二个来源 | Origin `https://b.example` | 同上 | `Access-Control-Allow-Origin: https://b.example` | 实测；逗号后的空格被去掉 | [ ] |
| 设了，不在列表里的来源 | Origin `https://evil.example` | 200 / 204 / 200 | **没有** `Access-Control-Allow-Origin`，但仍有 `Access-Control-Allow-Credentials: true`，预检仍是 204 | 实测；浏览器会拦下（缺 Allow-Origin） | [ ] |
| 设了，带口令的跨域删除 | 浏览器在 `https://a.example` 上 `fetch(..., {method:'DELETE', headers:{'X-Admin-Token':...}})` | 200 | — | 未实测于浏览器 | [ ] |
| 来源写法不同 | `CORS_ORIGINS=https://a.example/`（多了斜杠） | — | 浏览器发的 `Origin` 没有斜杠，匹配不上 | 未实测，依据精确匹配。配置时注意 | [ ] |

---

<a id="socket"></a>
## 10. Socket.IO 事件

- 同源连接，默认路径 `/socket.io`，传输 `websocket` 或 `polling`；不认证、不分房间，所有事件广播给所有连接。
- 服务端只发下面七个事件；客户端发什么都被忽略。

### 10.1 怎么观察

**Node（Git Bash，在仓库的 `frontend/` 目录里执行，用它自带的 `socket.io-client` 4.8.3）：**

```bash
cd frontend
BASE=$BASE node -e "const {io}=require('socket.io-client');const s=io(process.env.BASE,{transports:['websocket','polling']});s.on('connect',()=>console.log(new Date().toISOString(),'connect',s.id));s.on('disconnect',r=>console.log(new Date().toISOString(),'disconnect',r));s.on('connect_error',e=>console.log(new Date().toISOString(),'connect_error',e.message));s.onAny((e,...a)=>console.log(new Date().toISOString(),e,JSON.stringify(a)))"
```

开着这个终端，在另一个终端执行 curl。`Ctrl+C` 退出。

**浏览器控制台**（在 VanManga 页面上按 F12）：

```js
const { io } = await import('https://cdn.jsdelivr.net/npm/socket.io-client@4.8.3/+esm');
const s = io();                      // 同源
s.onAny((e, ...a) => console.log(new Date().toISOString(), e, a));
```

### 10.2 七个事件

触发方式和载荷都是实测（假抓取器）原样记录，长的 `manga` 对象截短。

| 事件 | 触发它的操作 | 实测载荷 |
|---|---|---|
| `queue_updated` | 任何入队、开始、结束（含失败）；重下被并入排队中的任务时也发 | `{"active":{"id":"69374de6-8c08-4363-8233-b56f24f21429","kind":"full-manga","mangaId":"img2","status":"running","enqueuedAt":1794731373226,"startedAt":1794731373226},"pending":[{"id":"7ef0cc3c-...","kind":"full-manga","mangaId":"slow3","status":"pending","enqueuedAt":1794731373347}]}` |
| `download_started` | `full-manga` 或 `redownload` 任务开始实际下载 | `{"manga_id":"img2","kind":"full-manga"}`；重下为 `{"manga_id":"slow3","kind":"redownload"}` |
| `download_progress` | 确定要下的章节后一次（`chapters_done:0`），之后每章结束一次 | `{"manga_id":"img2","chapters_total":2,"chapters_done":0,"chapters_failed":0}`，失败的章节也计入：`{"manga_id":"slow3","chapters_total":2,"chapters_done":1,"chapters_failed":1}` |
| `chapter_completed` | 一章下载并打包成功 | `{"manga_id":"img2","chapter_index":1,"chapter_title":"第1话","last_epi":1,"last_epi_name":"第1话","updated_at":1794731373}`；重下时 `last_epi` 不变：`{"manga_id":"img2","chapter_index":1,"chapter_title":"t","last_epi":2,"last_epi_name":"第2话","updated_at":1794731664}` |
| `download_completed` | 发过 `download_started` 的任务结束 | `{"manga_id":"img2","kind":"full-manga","status":"done","chapters_total":2,"chapters_failed":0,"manga":{"manga_id":"img2",...,"last_epi":2,"last_epi_name":"第2话","completed":true,...,"updated_at":1794731376,"kavita_url":null}}` |
| `scan_completed` | rezip 任务结束 | 无载荷（`onAny` 收到的参数为 `[]`） |
| `dmca_alert` | 下载任务发现源站下架，漫画已被删除 | `{"manga_id":"dmca5","manga_name":"下架漫画"}` |

### 10.3 实测的事件顺序

添加一部有 2 章的漫画（`img2`），每行一个事件：

```
queue_updated        {"active":null,"pending":[{...img2 pending}]}
queue_updated        {"active":{...img2 running},"pending":[]}
download_started     {"manga_id":"img2","kind":"full-manga"}
download_progress    {"chapters_total":2,"chapters_done":0,"chapters_failed":0}
queue_updated        (又添加了 slow3，排队中)
chapter_completed    {"chapter_index":1,"chapter_title":"第1话","last_epi":1,...}
download_progress    {"chapters_done":1,...}
chapter_completed    {"chapter_index":2,"chapter_title":"第2话","last_epi":2,...}
download_progress    {"chapters_done":2,...}
download_completed   {"status":"done","chapters_total":2,"chapters_failed":0,"manga":{...}}
queue_updated        {"active":null,"pending":[{...slow3}]}
queue_updated        {"active":{...slow3 running},"pending":[]}
```

两章之间有 2–5 秒间隔（下载器故意错开章节启动）。

### 10.4 边界情况

| 场景 | 操作 | 预期 | 还要检查什么 | ✓ |
|---|---|---|---|---|
| 没有章节可下 | 添加 `-neg1`（源站 1 章、章节列表为空） | `download_started` → `download_completed`（`status:"done"`、`chapters_total:0`），**没有** `download_progress` | 实测 | [ ] |
| 章节列表被 Cloudflare 拦截 | 添加 `cf4` | `download_started` → `download_completed`（`status:"failed"`、`chapters_total:0`、`chapters_failed:0`） | 实测 | [ ] |
| 元数据被 Cloudflare 拦截 | 库里一部元数据返回 501 的漫画 | 只有 `queue_updated`，没有 `download_started` | 依据代码（`handleSentinel`）；日志 `scraper hit CF wall (501); skipping` | [ ] |
| DMCA | 添加 `dmca5` | 只有 `dmca_alert` 和 `queue_updated`；`GET /api/library` 里没有它，封面已删 | 实测 | [ ] |
| 全部章节失败 | 添加 `fail6` | `download_progress` 0/1 → 1/1（`chapters_failed:1`）→ `download_completed`（`status:"failed"`），没有 `chapter_completed` | 实测 | [ ] |
| 任务直接报错 | 下载一部源未注册的漫画（配置 B `src1`） | 只有三个 `queue_updated`（入队、开始、结束） | 实测 | [ ] |
| 重下被合并 | 5.2 的合并场景 | 第二次提交也发一次 `queue_updated`，内容和上一次完全相同 | 实测 | [ ] |
| 切换自动更新 | 4.5 | 不发任何事件 | 实测 | [ ] |
| 删除漫画 | 4.6 | 不发任何事件（`dmca_alert` 只在下载任务里发） | 实测 | [ ] |
| 事件之后才连接 | 下载结束后再启动观察脚本 | 什么都收不到（不补发历史） | 实测：第二个客户端连接后，只收到它连接之后的事件 | [ ] |
| 两个客户端 | 同时开两个观察脚本，然后 `POST /api/download` | 两边收到完全相同的事件序列 | 实测 | [ ] |
| 重连 | 观察脚本开着时重启后端 | `disconnect transport close` → 若干 `connect_error websocket error`（约每 5 秒）→ `connect`（新 id）；断线期间的事件不补发 | 实测 | [ ] |
| 客户端发事件 | 连接后 `s.emit('download_started',{evil:true})`、`s.emit('hello',1)` | 服务端无回应、不报错、不转发给其他客户端 | 实测（观察脚本连接后自动发了这两个，另一客户端没收到，后端日志无异常） | [ ] |
| 跨域连接，没设 `CORS_ORIGINS` | 见第 9 节 | 轮询被浏览器拦；WebSocket 能连上 | 实测（WebSocket 部分用 Node 客户端带 Origin 头） | [ ] |
| 跨域连接，设了 `CORS_ORIGINS` | 允许的来源 | 轮询响应带 `Access-Control-Allow-Origin` | 实测 | [ ] |
| 旧事件名 | 整个测试过程 | 不出现 `downloading_info`、`response`、`complete_info` | 实测 | [ ] |
| 经反向代理 | 真实环境 | 能升级到 WebSocket | 未实测 | [ ] |

---

<a id="diff"></a>
## 11. 实测与契约不一致之处

`docs/api-contract.md` 没有改动；下面每条都需要决定是改代码还是改契约。

1. **非法 JSON 和超过 1 MB 的请求体返回 404 `not-found`，不是 400 `bad-request` / 413 `payload-too-large`**（契约 §1.3 最后一段）。
   - 实测（`NestFactory.create` 启动，同 `main.ts`）：`-d '{bad'` → `{"code":404,"error":"not-found","message":"Cannot POST /api/download"}`；1.5 MB 请求体 → `{"code":404,"error":"not-found","message":"Cannot POST /api/download/chapters"}`；JSON `null`、`"str"` 同样是 404。
   - 用 e2e 的方式（`Test.createTestingModule(...).compile()` + `createNestApplication`）启动同一份 `dist`，结果是契约写的 413 和 400。所以 `api-contract.e2e-spec.ts` 的 413 用例通过，但生产启动方式不符合。
   - 可能的原因：`@nestjs/serve-static` 5.0.5 的 `ExpressLoader` 注册了一个错误中间件，对 `exclude` 里的路径（`/api{/*path}`）把**任何**错误改写成 `NotFoundException("Cannot <METHOD> <url>")`。body-parser 的错误先到了这个中间件。两种启动方式下中间件的注册顺序不同。
   - 真实环境复现：容器里执行 0.5 节的两条命令。

2. **`/js/config.js` 和不存在的静态资源返回 200 `index.html`**（契约 §5 写 404；`frontend-static.e2e-spec.ts` 也期望 `/js/config.js`、`/assets/missing-abc.js` 是 404）。
   - 实测：`/js/config.js`、`/assets/nope.js`、`/nope.png` 都是 `200 text/html`。e2e 方式启动则是 404 JSON。
   - 可能的原因：`ServeStaticModule` 自己的 `renderPath`（默认 `*`）兜底返回 `index.html`，在生产启动方式下排在 Nest 的 404 处理之前。
   - 影响：浏览器缓存了旧版前端时，请求到的旧资源名会拿到 HTML，控制台报 MIME 错误而不是 404。

3. **重启后恢复的任务全部失败并被丢弃**（契约 §3.4："状态持久化到磁盘，重启后恢复（运行中被打断的任务回到队首）"）。
   - 实测日志顺序：`Restored 3 task(s)` → `Started task[full-manga, slow3]` → `failed: Unknown manga: slow3` → …（另外两个同样）→ `Loaded 4 manga from ...`。
   - 原因：`TaskQueueService.onModuleInit` 同步恢复后立即 `drain()`，而这时 `LibraryRepository.onModuleInit`（异步加载库文件）还没执行；`DownloadOrchestratorService` 注册执行器时队列就开始跑了。
   - 后果：恢复的 `redownload` 任务永久丢失；`full-manga` 任务只有在漫画 `completed: false` 时才会被启动扫描重新入队，已完成但有新章节的连载要等启动扫描查到新章节才会重新入队（这一条实际会发生，只是时机不同）。
   - 清单 1.5 的"下载进行中重启容器：重启后队列恢复"一项预计在真实环境也会失败。

4. **`GET /api/scraper/:source/chapter-images` 不带 `url` 时不返回 400**。契约没写这个接口的参数校验（Swagger 标了 `required: true`）。实测空值被直接传给抓取进程；假抓取器返回了 200，真实抓取器预计是 502 `scraper-failed`。


5. **`GET /api`（不带结尾斜杠）返回 `index.html`**。契约 §1.2 说未知路由一律输出 `ApiFailure`。`/api/` 和 `/api/xxx` 是 404 JSON，只有 `/api` 本身被 SPA 回退接住（`spa-fallback.ts` 判断的是 `startsWith('/api/')`）。影响很小。

6. **没设 `CORS_ORIGINS` 时，其他网站仍能用 WebSocket 连上 Socket.IO 并收到所有推送**。`app.setup.ts` 和 `events.gateway.ts` 的注释说"默认同源"；HTTP 和轮询传输确实没有 CORS 头，但 WebSocket 握手不检查 `Origin`。契约 §4 只写了"无需认证"，没有承诺同源，所以严格说不算违反契约，列在这里请确认是否接受。

7. **`POST /api/kavita/refreshtoken` 请求的是 `KAVITA_EXPOSE_URL`，`login` 请求的是 `KAVITA_BASE_URL`**（`kavita.service.ts`）。契约没写用哪个地址。当 `KAVITA_EXPOSE_URL` 是浏览器用的外网地址、容器里访问不到时，刷新会一直是 502 `kavita-unreachable`。本机两个地址相同，测不出来；真实环境请用两个不同的地址测一次。

8. **`scraper-failed` 的 `message` 不总是固定文案**。契约 §1.3 说"`scraper-failed` 的 `message` 是固定的通用说明"。抓取进程失败时确实是 `The scraper failed`（实测）；但源站在结果里返回 501/504/429 以外的 `errorCode` 时，`scrape-errors.ts` 的默认分支给出 `Source returned status <N>`（未实测，依据代码）。不含内部信息，只是文案不固定。

以下不是契约问题，但测试时需要知道：

- `delete-failed` 时记录和封面保留，但下载目录可能已经**部分删除**（实测：两个 zip 删掉了一个）。契约只写"记录未删除"。
- 新添加的记录在库文件里存的是 `"kavita_url": "None"`，接口返回时才转成 `null`。
- 在 Windows 的 Git Bash 里用 `curl -d` 发中文，服务端收到的是 U+FFFD，后端照单全收（实测生成了 `��2��.zip`）。后端没有办法区分，这是客户端问题，但人工测试时容易误判为后端 bug。

---

<a id="appendix-a"></a>
## 附录 A：本地假抓取器环境

用于复现标「实测，假抓取器」的行。需要先在 `backend/` 和 `frontend/` 里各执行一次 `npm run build`（`cd` 进目录执行）。本机 Node 低于 24.22.1 时 `backend/dist/main.js` 会因信任库检查拒绝启动，所以下面的启动脚本照 `frontend/e2e/start-backend.cjs` 的做法直接加载 `AppModule`，并像 `main.ts` 一样挂上 Swagger。

`frontend/e2e/start-backend.cjs` 本身也能用（`PORT=5480 node frontend/e2e/start-backend.cjs`），但它把 `ADMIN_TOKEN` 写死成"没设就用 `e2e-admin-token`"，测不了无口令的配置，假抓取器也只有成功路径，所以这里另外准备了一套。四个文件放在仓库外的任意目录（下例为 `~/vm-rig`），端口用 5400 以上的空闲端口。

`fake-scraper.cjs`（代替 `scrape_cli.py`；按关键词、id、url 选择行为）：

```js
'use strict';
const [, , , , command, , ...args] = process.argv;
const IMG = process.env.FAKE_UPSTREAM || 'http://127.0.0.1:5462';
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const CANDIDATES = [
  { manga_id: '-neg1', manga_name: '测试漫画一', artist_name: '测试作者', newest_epi: '第12话' },
  { manga_id: '-neg1x', manga_name: '测试漫画一!', artist_name: '测试作者', newest_epi: '第13话' },
  { manga_id: 'img2', manga_name: '有图漫画', artist_name: '作者二', newest_epi: '第2话', recent_update_date: '2026-11-14' },
  { manga_id: 'slow3', manga_name: '慢速漫画', artist_name: '作者三', newest_epi: '第2话' },
  { manga_id: 'cf4', manga_name: '被拦漫画', artist_name: '作者四', newest_epi: '第1话' },
  { manga_id: 'dmca5', manga_name: '下架漫画', artist_name: '作者五', newest_epi: '第1话' },
  { manga_id: 'fail6', manga_name: '全失败漫画', artist_name: '作者六', newest_epi: '第1话' },
  { manga_id: '漫画七', manga_name: 'Unicode 编号漫画', artist_name: '作者七', newest_epi: '第1话' },
];
process.stdin.resume();
process.stdin.on('data', () => {});
process.stdin.on('end', () => {
  const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  const id = args[0] || '';
  switch (command) {
    case 'search': {
      if (id === 'nothing') return emit({ ok: false, errorCode: 457, error: 'Source returned status 457' });
      if (id === 'boom') return emit({ ok: false, errorCode: null, error: 'fake boom at http://10.0.0.5:8191' });
      if (id === 'garbage') return process.stdout.write('not json\n');
      if (id === 'hang') return setTimeout(() => {}, 600_000);
      if (id === 'unsafe') return emit({ ok: true, data: [
        { manga_id: 'a/b', manga_name: 'slash', artist_name: 'x', newest_epi: '1', thumbnail: PIXEL },
        { manga_id: '..', manga_name: 'dotdot', artist_name: 'x', newest_epi: '1', thumbnail: PIXEL },
        { manga_id: 'safe9', manga_name: '安全漫画', artist_name: 'x', newest_epi: '1', thumbnail: PIXEL } ] });
      return emit({ ok: true, data: CANDIDATES.map((c) => ({ ...c, thumbnail: PIXEL })) });
    }
    case 'metadata': {
      if (id === 'dmca5') return emit({ ok: true, data: { chapterCount: 0, serialization: 0, errorCode: 504 } });
      if (id.startsWith('cfm')) return emit({ ok: true, data: { chapterCount: 0, serialization: 0, errorCode: 501 } });
      if (id.startsWith('boom')) return emit({ ok: false, errorCode: null, error: 'fake metadata failure' });
      if (id.startsWith('rl')) return emit({ ok: true, data: { chapterCount: 0, serialization: 0, errorCode: 429 } });
      return emit({ ok: true, data: { chapterCount: { img2: 2, slow3: 2, cf4: 1, fail6: 1 }[id] ?? 1, serialization: 0 } });
    }
    case 'chapters': {
      if (id === 'img2') return emit({ ok: true, data: { chapters: [1, 2].map((i) => ({ index: i, title: `第${i}话`, url: `${IMG}/ch/img2/${i}` })) } });
      if (id === 'slow3') return emit({ ok: true, data: { chapters: [1, 2].map((i) => ({ index: i, title: `第${i}话`, url: `slow://slow3/${i}` })) } });
      if (id === 'cf4') return emit({ ok: true, data: { chapters: [], errorCode: 501 } });
      if (id === 'dmca5') return emit({ ok: true, data: { chapters: [], errorCode: 504 } });
      if (id === 'fail6') return emit({ ok: true, data: { chapters: [{ index: 1, title: '第1话', url: 'fail://fail6/1' }] } });
      if (id.startsWith('rl')) return emit({ ok: true, data: { chapters: [], errorCode: 429 } });
      if (id.startsWith('boom')) return emit({ ok: false, errorCode: 500, error: 'fake chapters failure' });
      return emit({ ok: true, data: { chapters: [] } });
    }
    case 'chapter-images': {
      const images = { chapterTitle: '第1话', imageUrls: [`${IMG}/img/1.jpg`, `${IMG}/img/2.jpg`], imagePages: [], requestHeaders: {} };
      if (id.startsWith('slow://')) return setTimeout(() => emit({ ok: true, data: images }), 25_000);
      if (id.startsWith('fail://')) return emit({ ok: false, errorCode: 500, error: 'fake chapter failure' });
      if (id.includes('rl')) return emit({ ok: true, data: { ...images, imageUrls: [], errorCode: 429 } });
      if (id.includes('cf')) return emit({ ok: true, data: { ...images, imageUrls: [], errorCode: 501 } });
      if (id.includes('dmca')) return emit({ ok: true, data: { ...images, imageUrls: [], errorCode: 504 } });
      if (id.includes('boom')) return emit({ ok: false, errorCode: null, error: 'fake images failure' });
      return emit({ ok: true, data: images });
    }
    default:
      return emit({ ok: false, errorCode: null, error: `fake scraper: unsupported command ${command}` });
  }
});
```

`fake-upstream.cjs`（图片服务器 + 假 Kavita，`PORT` 默认 5462）：

```js
'use strict';
const http = require('node:http');
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const json = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    console.log(`${req.method} ${req.url} ${body}`);
    if (req.url.startsWith('/img/')) { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(JPEG); }
    let b = {}; try { b = body ? JSON.parse(body) : {}; } catch {}
    if (req.url === '/api/Account/login') {
      if (b.username === 'alice' && b.password === 'pw') return json(200, { apiKey: 'fake-api-key-123', token: 'jwt-aaa', refreshToken: 'rt-aaa' });
      if (b.username === 'crash') return json(500, { message: 'boom' });
      return json(401, 'Your credentials are not correct');
    }
    if (req.url === '/api/Account/refresh-token') {
      if (b.token === 'jwt-aaa' && b.refreshToken === 'rt-aaa') return json(200, { token: 'jwt-bbb', refreshToken: 'rt-bbb' });
      return json(400, 'Invalid token');
    }
    if (req.url.startsWith('/api/Plugin/authenticate')) return json(200, { token: 'plugin-jwt' });
    if (req.url === '/api/Series/all-v2') return json(200, [{ id: 42, folderPath: '/manga/有图漫画$img2' }]);
    if (req.url === '/api/Library/scan-folder') return json(200, {});
    json(404, { message: 'not found' });
  });
}).listen(Number(process.env.PORT || 5462), '127.0.0.1');
```

`boot.cjs`（启动后端）：

```js
'use strict';
const { join } = require('node:path');
const D = process.env.BACKEND_DIST;
const fromBackend = (id) => require(require.resolve(id, { paths: [D] }));
fromBackend('reflect-metadata');
const { NestFactory } = fromBackend('@nestjs/core');
const { SwaggerModule } = fromBackend('@nestjs/swagger');
const { AppModule } = require(join(D, 'app.module.js'));
const { configureApp } = require(join(D, 'app.setup.js'));
const { buildSwaggerDocument } = require(join(D, 'swagger.js'));
(async () => {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['log', 'error', 'warn', 'debug'] });
  configureApp(app);
  SwaggerModule.setup('api/docs', app, buildSwaggerDocument(app));
  await app.listen(Number(process.env.PORT));
})().catch((e) => { console.error(e); process.exit(1); });
```

`start.sh`（用法：`bash start.sh <数据目录>`，额外的配置用环境变量传入）：

```bash
RIG="$(cd "$(dirname "$0")" && pwd -W)"; DATA="$1"; mkdir -p "$DATA"
export NODE_ENV=test PORT="${PORT:-5461}" IMAGE_DELAY_MS=0 FLARESOLVERR_URL=
export LIBRARY_FILE="$DATA/config/manga_library.json" QUEUE_FILE="$DATA/config/queue.json"
export DOWNLOAD_ROOT="$DATA/downloaded" THUMBNAILS_DIR="$DATA/thumbnails"
export PYTHON_EXECUTABLE="$(command -v node)" PYTHON_CLI_SCRIPT="$RIG/fake-scraper.cjs" PYTHON_WORKING_DIR="$DATA"
export PYTHON_TIMEOUT_MS="${PYTHON_TIMEOUT_MS:-8000}"
export BACKEND_DIST="<仓库路径>/backend/dist" FAKE_UPSTREAM=http://127.0.0.1:5462
node "$RIG/boot.cjs"
```

三套配置的启动命令：

```bash
cd ~/vm-rig
PORT=5462 node fake-upstream.cjs &                               # 先起假上游
# 配置 A
ADMIN_TOKEN=test-admin-token KAVITA_BASE_URL=http://127.0.0.1:5462 KAVITA_EXPOSE_URL=http://127.0.0.1:5462 \
  KAVITA_ADMIN_APIKEY=admin-key SEARCH_CACHE_TTL_MS=30000 bash start.sh "$PWD/dataA"
# 配置 B（另开终端，先停 A）
bash start.sh "$PWD/dataB"
# 配置 C
CORS_ORIGINS='https://a.example, https://b.example' ADMIN_TOKEN=test-admin-token \
  KAVITA_BASE_URL=http://127.0.0.1:5463 KAVITA_EXPOSE_URL=http://127.0.0.1:5463 KAVITA_ADMIN_APIKEY=k bash start.sh "$PWD/dataC"
```

然后 `BASE=http://127.0.0.1:5461`，`TOKEN=test-admin-token`。测完 `Ctrl+C` 停掉后端和假上游，删掉 `data*` 目录。

假抓取器对应的场景速查：

| 输入 | 行为 |
|---|---|
| 搜索 `nothing` | 无结果（457） |
| 搜索 `boom` / `garbage` / `hang` | 进程报错 / 输出非 JSON / 不退出（等超时） |
| 搜索 `unsafe` | 返回 `a/b`、`..`、`safe9` |
| 搜索其他词 | 8 个候选（见上） |
| `-neg1`、`-neg1x`、`漫画七` | 源站 1 章、章节列表为空 |
| `img2` | 2 章，图片来自假上游，能真正生成 zip |
| `slow3` | 2 章，每章图片列表 25 秒后才返回（`PYTHON_TIMEOUT_MS=8000` 时超时） |
| `cf4` | 章节列表 Cloudflare 拦截（501） |
| `cfm*` | 元数据 Cloudflare 拦截 |
| `dmca5` | 元数据 DMCA（504） |
| `fail6` | 1 章，图片列表抓取失败 |
| `rl*` | 元数据、章节列表 429 |
| `boom*` | 元数据、章节列表进程报错 |
| 章节 url 含 `rl` / `cf` / `dmca` / `boom`，或以 `fail://` 开头 | 图片列表对应失败 |

<a id="appendix-b"></a>
## 附录 B：本次实测记录

- 日期：2026-11-15，本机 Windows 11，Git Bash，Node v22.14.0（项目要求 24.22.1；这一差异只影响 `main.js` 的信任库检查）。
- 代码：分支 `feature/nestjs-migration-stage-0-1`，提交 `6ec6637`，`backend/` 和 `frontend/` 各 `npm run build` 一次。
- 启动方式：附录 A 的 `boot.cjs`（`NestFactory.create` + `configureApp` + Swagger）。另用 `Test.createTestingModule` 方式启动过两次，只用于对比第 11 节第 1、2 条。
- 运行：配置 A（端口 5461，`PYTHON_TIMEOUT_MS=8000`，`SEARCH_CACHE_TTL_MS=30000`，假 Kavita），中途强杀并在同一数据目录重启一次；配置 B（无口令、无 Kavita、预置两条旧记录）；配置 C（`CORS_ORIGINS`，Kavita 指向无人监听的 5463）。
- Socket 观察：附录 A 之外另用一个 `socket.io-client` 4.8.3 脚本记录 `onAny` 的全部事件，一个客户端贯穿全程，另一个中途加入。
- 测完已停掉所有进程，删除了临时数据目录。
