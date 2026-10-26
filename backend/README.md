# VanManga NestJS

Hybrid migration: NestJS handles orchestration (API, queue, WebSocket,
scheduling, filesystem, library state); the proven Python scrapers under
`../modules/` and `../utils/` are kept as-is and invoked as a subprocess
via a thin CLI wrapper.

## Architecture

```
NestJS (TypeScript)              Python (existing code)
─────────────────────            ──────────────────────
ScraperService                   scrape_cli.py
  └─ SourceRegistry      <-->     └─ modules/DGmanga.py
       └─ DGmangaSource ──exec──> └─ modules/MangaSite.py
       └─ <future sources>        └─ utils/* (CF, paths, etc.)

DownloadService (in-memory FIFO queue)
SearchCacheService (search candidates for lean add)
LibraryService
EventsGateway (Socket.IO)
SchedulerService (@Cron)
```

One process per scrape command via `child_process.spawn` — typical scrape
is minute-scale, so subprocess startup (~200ms) is negligible.

## Docker

A single image holds the NestJS backend, the Python scraper
(`scrape_cli.py` + `modules/` + `utils/`, deps from
`requirements-scraper.txt` in a venv) and the built Vue3 SPA. Build from
the **repo root**:

```bash
docker build -f backend/Dockerfile -t vanmanga .
```

Data paths match the legacy Flask container, so existing volumes mount
unchanged:

| Path in container | Contents | Env override |
| --- | --- | --- |
| `/vanmanga/eng_config/manga_library.json` | library | `LIBRARY_FILE` |
| `/vanmanga/thumbnails` | cover images | `THUMBNAILS_DIR` |
| `/downloaded` | downloaded chapters / zips | `DOWNLOAD_ROOT` |

```bash
docker run -d -p 5000:5000 \
  -v /srv/vanmanga/eng_config:/vanmanga/eng_config \
  -v /srv/vanmanga/thumbnails:/vanmanga/thumbnails \
  -v /srv/vanmanga/downloaded:/downloaded \
  -e MANGA_BASE_URL=https://manga.example.com \
  -e MANGA_BASE_WEBSOCKET_URL=https://manga.example.com \
  vanmanga
```

Set `MANGA_BASE_URL` / `MANGA_BASE_WEBSOCKET_URL` to the public address.
`MANGA_BASE_WEBSOCKET_URL` is also written into each newly added manga's
`thumbnail` URL in the library (as Flask did); left unset, covers point at
`http://localhost:5000`. All variables are listed in `.env.example`.

The container runs as the non-root `node` user (uid 1000). Volumes created
by the old Flask container are root-owned; `chown -R 1000:1000` them once
before switching.

## Adding a new manga source

1. **Python**: drop a new class in `../modules/<NewSource>.py` extending
   `modules.MangaSite.MangaSite`. Re-use `utils/*` helpers freely.
2. **NestJS**: add `src/modules/scraper/sources/<new-source>.source.ts`
   implementing `IMangaSource`; it just shells out to
   `PythonRunnerService.run({ source: '<new-source>', cmd: '...' })`.
3. **Register**: add the new source to the `SourceRegistry` providers list.
4. The CLI dispatcher (`scrape_cli.py`) auto-imports by source name —
   no change needed there.

The download pipeline, queue, library state, scheduler and WebSocket
events are source-agnostic; new sources plug in without touching them.

## Status

| Stage | Scope                                                | State    |
| ----- | ---------------------------------------------------- | -------- |
| 0     | Scaffold, ConfigModule, pipes/filters, Docker         | Done     |
| 1     | FilesystemModule, CloudflareModule, EventsModule      | Done     |
| 2     | ScraperModule (Python subprocess + multi-source registry) | Done     |
| 3     | LibraryModule (manga_library.json repository, dedup, pagination, CRUD) | Done |
| 4     | DownloadModule (in-memory FIFO queue, image downloader, orchestrator) | Done |
| 5     | SchedulerModule + KavitaModule                        | Done     |
| 6     | Static frontend wiring + endpoint parity              | Done     |
| 7     | Swagger API docs, unit tests                          | Done     |

### Pending verification

Covered by unit tests only; not yet checked against a real service.
Kavita is optional and has no local setup, so verify these in a test or
production environment with `KAVITA_*` configured:

- [ ] **Kavita login / refresh-token** (`POST /api/kavita/login`,
  `/api/kavita/refreshtoken`): fields were stripped by the whitelist
  ValidationPipe before the fix, so these never worked on NestJS. Check a
  real login returns `apiKey`/`jwt`/`refreshToken` and the login URL opens
  Kavita.
- [ ] **Kavita enabled check**: now requires `KAVITA_BASE_URL`,
  `KAVITA_EXPOSE_URL` and `KAVITA_ADMIN_APIKEY` all set (as in Flask).
  Check `GET /api/kavita/status` returns `code: 200` with all three set.
- [ ] **Kavita sync and scan**: check the 6-hourly / startup sync fills
  `kavita_url` for downloaded manga, and that a finished download triggers
  a folder scan (`/manga/<name>$<id>`) that Kavita picks up.

## Local development

```bash
# Python scraper deps (from the repo root), in a venv
python -m venv .venv && .venv/bin/pip install -r requirements-scraper.txt

# NestJS deps; point PYTHON_EXECUTABLE in .env at the venv's python
cd backend && cp .env.example .env && npm install

# Run / test
npm run start:dev
npm test
```

Listens on `PORT` (default 5000), exposes everything under `/api`.

## Module map (current)

- `src/config` — environment-driven configuration (typed `AppConfig`).
- `src/common` — global filter, logging interceptor, shared
  ValidationPipe (`whitelist: true`: every DTO field needs a
  class-validator decorator) and the startup check that refuses a Node
  build still trusting a revoked root CA.
- `src/modules/filesystem` — directory tree, image writes, zip archive,
  thumbnail persistence. Replaces `utils/make_path.py`,
  `utils/generate_file_path.py`, `utils/re_zip_downloaded.py`,
  `utils/save_thumbnail.py`, `utils/thumbnails_creator.py`.
- `src/modules/cloudflare` — FlareSolverr client + CF state. Replaces
  `utils/flaresolverr_bypasser.py`.
- `src/modules/events` — Socket.IO gateway. Replaces all `socketio.emit`
  calls in `main.py` (events: `downloading_info`, `response`,
  `complete_info`, `scan_completed`, `dmca_alert`).
- `src/modules/scraper` — IMangaSource interface, Python subprocess
  runner, source registry, DGmanga adapter. **Wraps** existing Python
  scrapers — does not reimplement them.
- `src/modules/library` — manga_library.json repository, duplicate
  detection, pagination, full CRUD. Replaces `utils/make_manga_object.py`,
  `utils/duplicate_check.py`, `utils/lib_pagination.py` and the
  `DogeLibrary/Pagination/ShortLib/ChangeDownload/DeleteManga/...`
  Flask resources in main.py. Routes are mounted under both
  `/api/library/*` (new) and `/api/dogemanga/*` (legacy).
- `src/modules/download` — in-memory FIFO queue (concurrency=1),
  image downloader (429 backoff + CF headers), per-task orchestrator
  (chapters → images → zip → library update → WebSocket events).
  Replaces `utils/TaskQueue.py`, `confirm_comic_task` /
  `download_chapter_task` / `re_zip_task` in main.py, and
  `modules/DGmanga.py:download_img`. Routes under `/api/download/*`
  (new) and `/api/dogemanga/{redownload,cdl,dlqueue,rezip,confirmmanga}`
  (legacy). There is no `confirmdownload`: adding a manga already queues
  its download.
- `src/modules/search-cache` — in-memory TTL/FIFO cache of search
  candidates keyed by `source:manga_id`, so `POST /api/library` can take
  just `{ manga_id, source, submit_sign }`; a miss answers `410
  search-expired`. Search with `?thumb=url` returns cover URLs
  (`/api/scraper/:source/search-thumbnail/:id`) instead of base64.
- `src/modules/kavita` — Kavita server integration. Authenticate via
  Plugin API, sync kavita_url into library (every 6h), trigger folder
  scan after download completes, proxy login/refresh-token for the
  frontend. Replaces `utils/kavita_lib_pull.py`,
  `utils/kavita_scan_folder.py`, `KavitaStatus/KavitaLogin/
  KavitaRefreshToken` Flask resources. Routes under `/api/kavita/*`.
- `src/modules/scheduler` — Scheduled tasks via `@nestjs/schedule`.
  Daily scan (01:30 cron) checks all ongoing manga for new chapters
  and enqueues downloads. Kavita sync every 6 hours. Dynamic CF
  monitor (12 min interval, auto-added when CF is detected). Runs
  boot_scanning() on startup. Replaces Flask-APScheduler jobs in
  main.py.
- `src/modules/frontend` — Serves the Vue3 SPA from
  `frontend/dist/` (Vite build output) via `@nestjs/serve-static`. Dynamic
  `/js/config.js` endpoint injects `MANGA_BASE_URL` and
  `MANGA_BASE_WEBSOCKET_URL` from environment (replaces
  `create_config_js.sh`). SPA fallback serves `index.html` for
  client-side routes.
