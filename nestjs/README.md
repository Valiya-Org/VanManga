# VanManga NestJS

NestJS rewrite of the original Flask backend. See the migration plan in
the project root chat history for the full staged roadmap.

## Status

| Stage | Scope                                        | State    |
| ----- | -------------------------------------------- | -------- |
| 0     | Scaffold, ConfigModule, pipes/filters, Docker | Done     |
| 1     | FilesystemModule, CloudflareModule, EventsModule | Done |
| 2     | ScraperModule (DGmanga provider)             | Pending  |
| 3     | LibraryModule (manga_library.json repo)      | Pending  |
| 4     | DownloadModule (Bull queue)                  | Pending  |
| 5     | SchedulerModule + KavitaModule               | Pending  |
| 6     | Static frontend wiring + endpoint parity     | Pending  |
| 7     | Optional: Prisma + SQLite, Swagger, tests    | Pending  |

## Local development

```bash
cp .env.example .env
npm install
npm run start:dev
```

Listens on `PORT` (default 5000), exposes everything under `/api`.

## Module map (current)

- `src/config` — environment-driven configuration (typed AppConfig).
- `src/common` — global filter + logging interceptor.
- `src/modules/filesystem` — directory tree, image writes, zip archive,
  thumbnail persistence. Replaces `utils/make_path.py`,
  `utils/generate_file_path.py`, `utils/re_zip_downloaded.py`,
  `utils/save_thumbnail.py`, `utils/thumbnails_creator.py`.
- `src/modules/cloudflare` — FlareSolverr client + CF state. Replaces
  `utils/flaresolverr_bypasser.py`.
- `src/modules/events` — Socket.IO gateway. Replaces all `socketio.emit`
  calls in `main.py` (events: `downloading_info`, `response`,
  `complete_info`, `scan_completed`).
