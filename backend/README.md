# VanManga backend (NestJS)

The NestJS service: HTTP API under `/api`, Socket.IO events, download
queue, scheduled jobs, the library file, and static hosting of the built
SPA. Scraping is done by the Python code at the repo root (`scrape_cli.py`,
`modules/`, `utils/`), run as one subprocess per command.

Deployment, local development, every environment variable and the upgrade
path from the Flask version are in the [root README](../README.md). The
client contract is [`docs/api-contract.md`](../docs/api-contract.md);
Swagger is served at `/api/docs`. `.env.example` lists the variables with
their defaults.

```bash
cp .env.example .env && npm install
npm run start:dev      # run from backend/; relative paths resolve here
npm test               # unit tests
npm run test:e2e       # needs ../frontend/dist (cd ../frontend && npm run build)
npm run lint
```

## Architecture

```
NestJS (TypeScript)              Python
─────────────────────            ──────────────────────
ScraperService                   scrape_cli.py
  └─ SourceRegistry      <-->     └─ modules/DGmanga.py
       └─ DGmangaSource ──exec──> └─ modules/MangaSite.py
       └─ <future sources>        └─ utils/*

DownloadService (FIFO queue, persisted to queue.json)
SearchCacheService (search candidates for the lean add)
LibraryService (manga_library.json)
EventsGateway (Socket.IO)
SchedulerService (@Cron / @Interval)
```

## Module map

- `src/config` — environment-driven configuration (typed `AppConfig`).
- `src/common` — global exception filter (failure envelope), logging
  interceptor, shared ValidationPipe (`whitelist: true`: every DTO field
  needs a class-validator decorator), the admin-token guard, and the
  startup check that refuses a Node build still trusting a revoked root CA.
- `src/modules/filesystem` — directory tree, image writes, zip archives,
  cover files.
- `src/modules/cloudflare` — FlareSolverr client and Cloudflare state.
- `src/modules/events` — Socket.IO gateway; emits only the seven events in
  the contract.
- `src/modules/scraper` — `IMangaSource`, the Python subprocess runner,
  source registry, DGmanga adapter; routes `/api/scraper/*`.
- `src/modules/search-cache` — TTL/FIFO cache of search candidates keyed
  by `source:manga_id`, so `POST /api/library` takes just
  `{ manga_id, source, submit_sign }`.
- `src/modules/library` — the `manga_library.json` repository (atomic
  writes; refuses to boot on a corrupt file), duplicate detection,
  pagination; routes `/api/library/*`.
- `src/modules/download` — FIFO queue (one task at a time, persisted to
  `queue.json`, restored and de-duplicated on boot), image downloader,
  per-task orchestrator; routes `/api/download/*`, `POST /api/library/rezip`
  and `GET /api/library/:id/chapters`.
- `src/modules/kavita` — Kavita sync, folder scans, login/refresh proxy;
  routes `/api/kavita/*`.
- `src/modules/scheduler` — boot scan, daily 01:30 scan, 6-hourly Kavita
  sync, dynamic 12-minute Cloudflare monitor.
- `src/modules/frontend` — serves `../frontend/dist` with an SPA fallback
  for client-side routes, and `GET /api/config`.

## Adding a manga source

1. **Python**: add a class in `../modules/<NewSource>.py` extending
   `modules.MangaSite.MangaSite`, and register it in
   `../scrape_cli.py:SOURCE_REGISTRY`.
2. **NestJS**: add `src/modules/scraper/sources/<new-source>.source.ts`
   implementing `IMangaSource`; it shells out through
   `PythonRunnerService`.
3. **Register**: add the class to the `sources` list in
   `src/modules/scraper/scraper.module.ts`.

The download pipeline, queue, library, scheduler and socket events are
source-agnostic.

## Pending verification

Covered by unit tests only; Kavita has no local setup, so check these in
an environment with `KAVITA_*` configured:

- [ ] `POST /api/kavita/login` / `refreshtoken` return
  `apiKey`/`jwt`/`refreshToken`, and the login URL opens Kavita.
- [ ] With all three of `KAVITA_BASE_URL`, `KAVITA_EXPOSE_URL`,
  `KAVITA_ADMIN_APIKEY` set, `GET /api/config` reports
  `kavitaEnabled: true`.
- [ ] The startup / 6-hourly sync fills `kavita_url` for downloaded manga,
  and a finished download triggers a folder scan
  (`/manga/<name>$<id>`) that Kavita picks up.
