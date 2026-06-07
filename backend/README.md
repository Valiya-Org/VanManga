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

DownloadService (Bull)
LibraryService
EventsGateway (Socket.IO)
SchedulerService (@Cron)
```

Single Docker image: `node:20` base + `apk add python3` + `pip install
-r requirements.txt`. One process per scrape command via
`child_process.execFile` — typical scrape is minute-scale, so subprocess
startup (~200ms) is negligible.

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
| 7     | Swagger API docs, unit tests (22 passing)             | Done     |

## Local development

```bash
# Install Python deps (re-uses existing requirements.txt at repo root)
cd .. && pip install -r requirements.txt

# Install NestJS deps
cd nestjs && cp .env.example .env && npm install

# Run
npm run start:dev
```

Listens on `PORT` (default 5000), exposes everything under `/api`.

## Module map (current)

- `src/config` — environment-driven configuration (typed `AppConfig`).
- `src/common` — global filter + logging interceptor.
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
  (new) and `/api/dogemanga/{confirmdownload,redownload,cdl,dlqueue,
  rezip,confirmmanga}` (legacy).
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
- `src/modules/frontend` — Serves the Vue SPA from
  `frontend_static/static/` via `@nestjs/serve-static`. Dynamic
  `/js/config.js` endpoint injects `MANGA_BASE_URL` and
  `MANGA_BASE_WEBSOCKET_URL` from environment (replaces
  `create_config_js.sh`). SPA fallback serves `index.html` for
  client-side routes.
