# VanManga

<div align="center">

![VanManga](https://github.com/user-attachments/assets/9f8b9d7e-e573-4adb-9503-2783ebd507a4)

[中文](#中文) · [English](#english)

</div>

---

## 中文

VanManga 是一个自托管的漫画抓取与管理服务：从漫画源（目前是 [DogeManga](https://dogemanga.com/)，源名 `dgmanga`）搜索漫画、加入漫画库、按章节下载并打包成 zip，每天自动检查更新，并可与 [Kavita](https://github.com/Kareadita/Kavita) 阅读服务器联动。

### 功能

- 搜索漫画源，添加时与库内已有漫画查重（相似名字需要再次确认）
- 下载队列：一次处理一部漫画，队列持久化到 `queue.json`，重启后继续
- 每天 01:30 扫描漫画库：未下完的继续下载，连载中的检查新章节；启动时也会扫描一次
- 重新下载指定章节；整个下载目录重新打包（rezip）
- 自动更新开关、删除漫画（连同下载目录）
- 源站报告 DMCA 下架时，自动把该漫画移出漫画库
- Kavita：每 6 小时同步一次 Kavita 系列链接，下载完成后请求 Kavita 扫描对应目录；代理 Kavita 登录
- FlareSolverr：检测到 Cloudflare 拦截时借助 FlareSolverr 通过检查，并每 12 分钟复查一次
- 可选的管理员口令（`ADMIN_TOKEN`）保护删除和重新打包

### 架构

一个 Docker 镜像里包含三部分：

| 部分 | 位置 | 作用 |
| --- | --- | --- |
| 后端（NestJS） | `backend/` | HTTP 接口（`/api`）、Socket.IO 事件、下载队列、定时任务、漫画库文件读写，并托管前端静态文件 |
| 抓取器（Python） | `scrape_cli.py`、`modules/`、`utils/` | 后端每次抓取时以子进程方式调用 `scrape_cli.py`，依赖见 `requirements-scraper.txt` |
| 前端（Vue 3 SPA） | `frontend/` | 构建产物 `frontend/dist` 由后端在 `/` 提供 |

数据文件：

| 文件 / 目录 | 内容 |
| --- | --- |
| `manga_library.json`（`LIBRARY_FILE`） | 漫画库，JSON 对象，键为 `manga_id` |
| `queue.json`（`QUEUE_FILE`，默认与漫画库同目录） | 尚未完成的下载任务 |
| 封面目录（`THUMBNAILS_DIR`） | `<manga_id>.jpg` |
| 下载目录（`DOWNLOAD_ROOT`） | `<漫画名>$<manga_id>/<漫画名>/<章节名>.zip` |

接口文档：[`docs/api-contract.md`](docs/api-contract.md)（HTTP 与 Socket.IO 的完整约定），运行时 Swagger 在 `/api/docs`。

### 用 Docker 部署

在仓库根目录构建镜像：

```bash
docker build -t vanmanga .
```

运行（把左侧换成你主机上的目录）：

```bash
docker run -d --name vanmanga --restart unless-stopped -p 5000:5000 \
  -v /srv/vanmanga/eng_config:/vanmanga/eng_config \
  -v /srv/vanmanga/thumbnails:/vanmanga/thumbnails \
  -v /srv/vanmanga/downloaded:/downloaded \
  -e ADMIN_TOKEN=换成一个口令 \
  vanmanga
```

- 容器内路径：漫画库 `/vanmanga/eng_config/manga_library.json`，队列 `/vanmanga/eng_config/queue.json`，封面 `/vanmanga/thumbnails`，下载 `/downloaded`。
- 容器以非 root 用户 `node`（uid 1000）运行，挂载的目录必须对它可写：`chown -R 1000:1000 /srv/vanmanga`。
- 镜像自带健康检查（请求 `/api/scraper/sources`）。
- 启用 Kavita 需同时设置 `KAVITA_BASE_URL`、`KAVITA_EXPOSE_URL`、`KAVITA_ADMIN_APIKEY`。下载完成后，后端请求 Kavita 扫描 `/manga/<漫画名>$<manga_id>`，所以 Kavita 容器需要把同一个下载目录挂载为 `/manga`。

### 本地开发

需要：Node.js 版本见 `.nvmrc`（当前 24.22.1；`package.json` 的 `engines` 允许 `^22.23.4 || ^24.22.1 || >=26.12.1`，Node 仍信任已吊销的根证书时后端拒绝启动），Python 3（CI 用 3.11）。

```bash
# 1. Python 抓取器依赖（仓库根目录，建议用 venv）
python -m venv .venv
.venv/bin/pip install -r requirements-scraper.txt      # Windows: .venv\Scripts\pip

# 2. 后端（在 backend/ 目录里运行，相对路径都以它为准）
cd backend
cp .env.example .env        # 把 PYTHON_EXECUTABLE 指向 venv 里的 python
npm install
npm run start:dev           # http://localhost:5000，Swagger 在 /api/docs

# 3. 前端开发服务器（另开一个终端）
cd frontend
npm install
npm run dev                 # http://localhost:5173，/api 与 /socket.io 代理到 localhost:5000
```

后端也会直接提供 `frontend/dist`：先在 `frontend/` 里 `npm run build`，再访问 `http://localhost:5000`。

测试：

```bash
cd backend && npm test && npm run lint && npm run test:e2e   # e2e 需要先构建 frontend/dist
cd frontend && npm test && npm run lint && npm run typecheck
```

后端从 `backend/.env.local`、`backend/.env` 读取环境变量（已有的进程环境变量优先）。

### 环境变量

全部可选。相对路径以后端的工作目录（`backend/`）为准。“镜像值”是 Dockerfile 里设置的值。

| 变量 | 默认值 | 镜像值 | 说明 |
| --- | --- | --- | --- |
| `PORT` | `5000` | `5000` | 监听端口 |
| `NODE_ENV` | `development` | `production` | 运行环境标识 |
| `LIBRARY_FILE` | `./eng_config/manga_library.json` | `/vanmanga/eng_config/manga_library.json` | 漫画库文件 |
| `QUEUE_FILE` | 与 `LIBRARY_FILE` 同目录的 `queue.json` | （默认） | 下载队列持久化文件；留空即默认 |
| `THUMBNAILS_DIR` | `./thumbnails` | `/vanmanga/thumbnails` | 封面目录 |
| `DOWNLOAD_ROOT` | `./downloaded` | `/downloaded` | 下载目录 |
| `NUMBER_OF_WORKERS` | `2` | | 一部漫画内同时下载的章节数。调高容易被源站拦截 |
| `IMAGE_CONCURRENCY` | `1` | | 一个章节内同时下载的图片数 |
| `IMAGE_DELAY_MS` | `1000` | | 每张图片之间的等待（毫秒），另加 0 到同等时长的随机抖动；`0` 关闭 |
| `DOWNLOAD_PROGRESS_INTERVAL_MS` | `10000` | | 长章节下载时输出“X/Y 张”进度日志的间隔（毫秒）；`0` 关闭 |
| `SEARCH_CACHE_TTL_MS` | `1800000` | | 搜索结果缓存时长（毫秒）。超过这个时间再添加，接口返回 `410 search-expired`，需重新搜索 |
| `SEARCH_CACHE_MAX_ENTRIES` | `500` | | 搜索结果缓存条数上限，超出时先进先出 |
| `ADMIN_TOKEN` | 空（关闭） | | 设置后，删除漫画（`DELETE /api/library/:id`）和重新打包（`POST /api/library/rezip`）需带请求头 `X-Admin-Token` |
| `CORS_ORIGINS` | 空（关闭） | | 允许跨域访问 HTTP 接口和 Socket.IO 的来源，逗号分隔（如 `https://a.example,https://b.example`）。默认不发送任何 CORS 头：前端与后端同源，开发时 Vite 代理也不需要它 |
| `KAVITA_BASE_URL` | 空 | | 后端访问 Kavita 的地址（如容器内网地址） |
| `KAVITA_EXPOSE_URL` | 空 | | 浏览器访问 Kavita 的地址（登录链接、系列链接） |
| `KAVITA_ADMIN_APIKEY` | 空 | | Kavita 管理员 API Key |
| `KAVITA_LIB_ID` | `1` | | 生成系列链接用的 Kavita 库编号 |
| `FLARESOLVERR_URL` | 空（关闭） | | FlareSolverr 地址；设置后启用 Cloudflare 检测与复查 |
| `PYTHON_EXECUTABLE` | `python` | `python`（镜像内 venv） | 装好 `requirements-scraper.txt` 的 Python 解释器 |
| `PYTHON_CLI_SCRIPT` | `../scrape_cli.py` | `/app/scrape_cli.py` | 抓取器入口 |
| `PYTHON_WORKING_DIR` | `..` | `/app` | 抓取器工作目录（需包含 `modules/`） |
| `PYTHON_TIMEOUT_MS` | `180000` | | 单次抓取子进程的超时（毫秒） |

Kavita 只有在 `KAVITA_BASE_URL`、`KAVITA_EXPOSE_URL`、`KAVITA_ADMIN_APIKEY` 三个都设置时才启用。

### 从 Flask 版升级

1. **备份**：停止旧容器，备份三个挂载目录（`eng_config`、`thumbnails`、`downloaded`），尤其是 `manga_library.json`。
2. **目录权限**：旧容器以 root 运行，新容器以 uid 1000 运行，执行一次 `chown -R 1000:1000` 你的三个目录。
3. **构建并运行**：`docker build -t vanmanga .`，然后按上文 `docker run` 运行。容器内的数据路径与 Flask 版相同（`/vanmanga/eng_config`、`/vanmanga/thumbnails`、`/downloaded`），原来的挂载可以原样沿用。
4. **环境变量**：
   - `LIB_PATH` 改名为 `LIBRARY_FILE`：新版只读取 `LIBRARY_FILE`。如果旧部署用 `LIB_PATH` 指定了非默认位置的漫画库，必须改用 `LIBRARY_FILE` 指向同一个文件，否则新版找不到它，会新建一个空漫画库（旧文件不会被改动）。
   - 删除 `MANGA_BASE_URL`、`MANGA_BASE_WEBSOCKET_URL`：已不再读取，前端通过同源的 `GET /api/config` 获取配置。
   - `PYTHONUNBUFFERED` 不再需要（后端不读取它，留着也无害）。
   - `KAVITA_*`、`FLARESOLVERR_URL`、`NUMBER_OF_WORKERS` 含义不变，照旧设置。
   - 新增：`ADMIN_TOKEN`（建议设置）以及上表中的其他可选项。
5. **首次启动**：
   - `manga_library.json` 按原样读取，**不做迁移**。旧记录里的差异（封面地址、缺少的 `updated_at` / `source`、`kavita_url` 为 `"None"` 等）在接口返回时统一处理；之后正常的写入会给记录补上新字段（例如下载后写入 `updated_at`），新加入的漫画保存相对封面地址 `/api/library/<id>/thumbnail`。
   - 漫画库文件不是合法 JSON 对象（损坏、截断）时，服务**拒绝启动**并在日志里说明原因，文件不会被改动；修复或从备份恢复后再启动。文件不存在时会新建一个空漫画库。
   - `queue.json` 在队列第一次变化时创建于漫画库同目录。
   - 启动后会扫描一次漫画库：未下完的漫画继续下载，连载中的检查新章节。

### 新增抓取源

见 [`backend/README.md`](backend/README.md)。

### 许可

MIT

### 贡献者

Tom "Van" Wang & Kun "Alen" Qi

---

## English

VanManga is a self-hosted manga scraper and library manager. It searches a manga source (currently [DogeManga](https://dogemanga.com/), source name `dgmanga`), adds titles to a library, downloads them chapter by chapter into zip archives, checks for updates every day, and works with the [Kavita](https://github.com/Kareadita/Kavita) reader.

### Features

- Search the source; adding a manga checks the library for similar titles (a near-duplicate needs a second confirmation)
- Download queue: one manga at a time, persisted to `queue.json` and resumed after a restart
- Daily library scan at 01:30 (and once at startup): unfinished manga resume, ongoing series are checked for new chapters
- Re-download selected chapters; re-zip the whole download folder
- Per-manga auto-update switch; delete a manga together with its download folder
- When the source reports a DMCA takedown, the manga is removed from the library
- Kavita: series links synced every 6 hours, a folder scan requested after each download, Kavita login proxied
- FlareSolverr: gets past Cloudflare challenges when one is detected, re-checking every 12 minutes
- Optional admin token (`ADMIN_TOKEN`) protecting delete and re-zip

### Architecture

One Docker image holds three parts:

| Part | Location | Role |
| --- | --- | --- |
| Backend (NestJS) | `backend/` | HTTP API (`/api`), Socket.IO events, download queue, scheduled jobs, library file, and serves the built frontend |
| Scraper (Python) | `scrape_cli.py`, `modules/`, `utils/` | Run by the backend as a subprocess for every scrape; dependencies in `requirements-scraper.txt` |
| Frontend (Vue 3 SPA) | `frontend/` | Its build, `frontend/dist`, is served by the backend at `/` |

Data files:

| File / directory | Contents |
| --- | --- |
| `manga_library.json` (`LIBRARY_FILE`) | The library: a JSON object keyed by `manga_id` |
| `queue.json` (`QUEUE_FILE`, defaults to the library's directory) | Download tasks not yet finished |
| Cover directory (`THUMBNAILS_DIR`) | `<manga_id>.jpg` |
| Download directory (`DOWNLOAD_ROOT`) | `<name>$<manga_id>/<name>/<chapter>.zip` |

API reference: [`docs/api-contract.md`](docs/api-contract.md) (the full HTTP and Socket.IO contract, in Chinese); Swagger is served at `/api/docs`.

### Run with Docker

Build from the repository root:

```bash
docker build -t vanmanga .
```

Run it (replace the host paths on the left):

```bash
docker run -d --name vanmanga --restart unless-stopped -p 5000:5000 \
  -v /srv/vanmanga/eng_config:/vanmanga/eng_config \
  -v /srv/vanmanga/thumbnails:/vanmanga/thumbnails \
  -v /srv/vanmanga/downloaded:/downloaded \
  -e ADMIN_TOKEN=change-me \
  vanmanga
```

- Paths in the container: library `/vanmanga/eng_config/manga_library.json`, queue `/vanmanga/eng_config/queue.json`, covers `/vanmanga/thumbnails`, downloads `/downloaded`.
- The container runs as the non-root `node` user (uid 1000); the mounted directories must be writable by it: `chown -R 1000:1000 /srv/vanmanga`.
- The image has a health check (it requests `/api/scraper/sources`).
- Kavita is enabled only when `KAVITA_BASE_URL`, `KAVITA_EXPOSE_URL` and `KAVITA_ADMIN_APIKEY` are all set. After a download the backend asks Kavita to scan `/manga/<name>$<manga_id>`, so the Kavita container must mount the same download directory as `/manga`.

### Local development

Requirements: the Node.js version in `.nvmrc` (currently 24.22.1; `engines` accepts `^22.23.4 || ^24.22.1 || >=26.12.1`, and the backend refuses to start on a Node build that still trusts a revoked root CA), and Python 3 (CI uses 3.11).

```bash
# 1. Python scraper dependencies (repository root, preferably in a venv)
python -m venv .venv
.venv/bin/pip install -r requirements-scraper.txt      # Windows: .venv\Scripts\pip

# 2. Backend (run it from backend/; relative paths resolve against it)
cd backend
cp .env.example .env        # point PYTHON_EXECUTABLE at the venv's python
npm install
npm run start:dev           # http://localhost:5000, Swagger at /api/docs

# 3. Frontend dev server (second terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api and /socket.io to localhost:5000
```

The backend also serves `frontend/dist` directly: run `npm run build` in `frontend/`, then open `http://localhost:5000`.

Tests:

```bash
cd backend && npm test && npm run lint && npm run test:e2e   # e2e needs frontend/dist built first
cd frontend && npm test && npm run lint && npm run typecheck
```

The backend reads `backend/.env.local` and `backend/.env` (variables already in the process environment win).

### Environment variables

All optional. Relative paths resolve against the backend's working directory (`backend/`). "Image" is the value the Dockerfile sets.

| Variable | Default | Image | Meaning |
| --- | --- | --- | --- |
| `PORT` | `5000` | `5000` | Listen port |
| `NODE_ENV` | `development` | `production` | Environment name |
| `LIBRARY_FILE` | `./eng_config/manga_library.json` | `/vanmanga/eng_config/manga_library.json` | Library file |
| `QUEUE_FILE` | `queue.json` next to `LIBRARY_FILE` | (default) | Persisted download queue; empty means the default |
| `THUMBNAILS_DIR` | `./thumbnails` | `/vanmanga/thumbnails` | Cover directory |
| `DOWNLOAD_ROOT` | `./downloaded` | `/downloaded` | Download directory |
| `NUMBER_OF_WORKERS` | `2` | | Chapters downloaded in parallel within one manga. Higher values get blocked by the source more easily |
| `IMAGE_CONCURRENCY` | `1` | | Images downloaded in parallel within one chapter |
| `IMAGE_DELAY_MS` | `1000` | | Delay between images (ms), plus a random jitter of up to the same amount; `0` disables |
| `DOWNLOAD_PROGRESS_INTERVAL_MS` | `10000` | | Interval (ms) of the "X/Y images" log line for long chapters; `0` disables |
| `SEARCH_CACHE_TTL_MS` | `1800000` | | How long search results stay cached (ms). Adding a manga later than this answers `410 search-expired`; search again |
| `SEARCH_CACHE_MAX_ENTRIES` | `500` | | Maximum cached search results, evicted first-in first-out |
| `ADMIN_TOKEN` | empty (off) | | When set, deleting a manga (`DELETE /api/library/:id`) and re-zipping (`POST /api/library/rezip`) require the `X-Admin-Token` header |
| `CORS_ORIGINS` | empty (off) | | Comma-separated origins allowed to call the HTTP API and Socket.IO cross-origin (e.g. `https://a.example,https://b.example`). By default no CORS headers are sent: the frontend is same-origin, and the Vite dev proxy does not need it either |
| `KAVITA_BASE_URL` | empty | | Kavita address the backend uses (e.g. the container network address) |
| `KAVITA_EXPOSE_URL` | empty | | Kavita address browsers use (login links, series links) |
| `KAVITA_ADMIN_APIKEY` | empty | | Kavita admin API key |
| `KAVITA_LIB_ID` | `1` | | Kavita library number used in series links |
| `FLARESOLVERR_URL` | empty (off) | | FlareSolverr address; enables Cloudflare detection and re-checks |
| `PYTHON_EXECUTABLE` | `python` | `python` (the image's venv) | Python interpreter with `requirements-scraper.txt` installed |
| `PYTHON_CLI_SCRIPT` | `../scrape_cli.py` | `/app/scrape_cli.py` | Scraper entry point |
| `PYTHON_WORKING_DIR` | `..` | `/app` | Scraper working directory (must contain `modules/`) |
| `PYTHON_TIMEOUT_MS` | `180000` | | Timeout of one scraper subprocess (ms) |

Kavita is enabled only when `KAVITA_BASE_URL`, `KAVITA_EXPOSE_URL` and `KAVITA_ADMIN_APIKEY` are all set.

### Upgrading from the Flask version

1. **Back up**: stop the old container and back up the three mounted directories (`eng_config`, `thumbnails`, `downloaded`), above all `manga_library.json`.
2. **Ownership**: the old container ran as root, the new one runs as uid 1000; run `chown -R 1000:1000` on the three directories once.
3. **Build and run**: `docker build -t vanmanga .`, then `docker run` as above. The data paths inside the container are the same as in the Flask version (`/vanmanga/eng_config`, `/vanmanga/thumbnails`, `/downloaded`), so the existing mounts carry over unchanged.
4. **Environment variables**:
   - Rename `LIB_PATH` to `LIBRARY_FILE`: the new version reads only `LIBRARY_FILE`. If the old deployment used `LIB_PATH` to put the library somewhere other than the default, point `LIBRARY_FILE` at the same file, or the new version will not find it and will create an empty library (the old file is left untouched).
   - Remove `MANGA_BASE_URL` and `MANGA_BASE_WEBSOCKET_URL`: they are no longer read; the frontend gets its configuration from the same-origin `GET /api/config`.
   - `PYTHONUNBUFFERED` is no longer needed (the backend does not read it; leaving it set is harmless).
   - `KAVITA_*`, `FLARESOLVERR_URL` and `NUMBER_OF_WORKERS` mean the same as before.
   - New: `ADMIN_TOKEN` (recommended) and the other optional settings in the table above.
5. **First start**:
   - `manga_library.json` is read as-is and **not migrated**. Differences in old records (cover URLs, missing `updated_at` / `source`, `kavita_url` of `"None"`, ...) are normalised when the API returns them; normal writes later add the new fields (e.g. `updated_at` after a download), and newly added manga store the relative cover URL `/api/library/<id>/thumbnail`.
   - If the library file is not a valid JSON object (corrupt, truncated), the server **refuses to start** and logs why, leaving the file untouched; repair it or restore the backup, then start again. A missing file is created as an empty library.
   - `queue.json` is created next to the library file the first time the queue changes.
   - After start-up the library is scanned once: unfinished manga resume, ongoing series are checked for new chapters.

### Adding a manga source

See [`backend/README.md`](backend/README.md).

### License

MIT

### Contributors

Tom "Van" Wang & Kun "Alen" Qi
