import { Logger } from '@nestjs/common';
import { dirname, join, resolve } from 'path';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  storage: {
    downloadRoot: string;
    libraryFile: string;
    thumbnailsDir: string;
    /** Persisted download queue (QUEUE_FILE; default queue.json next to
     *  the library file). */
    queueFile: string;
  };
  concurrency: {
    workers: number;
  };
  /** Image-download tuning. Exposed as discrete knobs so a future
   *  frontend settings panel can map straight onto them. */
  download: {
    /** Concurrent image fetches within a single chapter. */
    imageConcurrency: number;
    /** Polite delay (ms) between image fetches per worker; 0 disables.
     *  A random jitter up to the same amount is added on top, mirroring
     *  the legacy gevent.sleep(1 + rand) between images in
     *  modules/DGmanga.py. */
    imageDelayMs: number;
    /** How often (ms) to emit a "X/Y images" heartbeat while a chapter is
     *  still downloading; 0 disables. Only fires for chapters that outlast
     *  one interval, so short chapters stay quiet. */
    progressIntervalMs: number;
  };
  /** Server-side cache of search candidates, so the frontend can submit
   *  an "add" with just {source, manga_id} instead of echoing the base64
   *  cover thumbnail back to the server. */
  searchCache: {
    /** How long a cached candidate stays resolvable (ms). */
    ttlMs: number;
    /** Hard cap on cached candidates (FIFO eviction beyond this). */
    maxEntries: number;
  };
  kavita: {
    baseUrl: string;
    exposeUrl: string;
    adminApiKey: string;
    libId: number;
    enabled: boolean;
  };
  flaresolverr: {
    url: string;
    enabled: boolean;
  };
  security: {
    /** ADMIN_TOKEN; '' disables protection of destructive routes. */
    adminToken: string;
    /** CORS_ORIGINS: origins allowed to call the API and the socket
     *  cross-origin. Empty (the default) sends no CORS headers at all —
     *  the SPA is served from the same origin. */
    corsOrigins: string[];
  };
  python: {
    /** Python interpreter — default `python` on PATH. */
    executable: string;
    /** Path to scrape_cli.py — defaults to ../scrape_cli.py at repo root. */
    cliScript: string;
    /** Working directory the CLI is launched in (must contain modules/). */
    workingDir: string;
    /** Hard timeout per CLI invocation (ms). */
    timeoutMs: number;
  };
}

/** A whole-number env var, `fallback` when unset or blank. Anything else
 *  that is not a plain integer >= min fails startup: parseInt would turn
 *  `two` into NaN (e.g. a NaN chapter concurrency stalls every download)
 *  and `2abc` into 2 without a word. */
function intEnv(name: string, fallback: number, min: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (raw === '') return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < min || !Number.isSafeInteger(Number(raw))) {
    throw new Error(
      `Invalid ${name}=${JSON.stringify(process.env[name])}: expected a whole number >= ${min}`,
    );
  }
  return Number(raw);
}

export default (): AppConfig => {
  const kavitaBaseUrl = process.env.KAVITA_BASE_URL ?? '';
  const kavitaExposeUrl = process.env.KAVITA_EXPOSE_URL ?? '';
  const kavitaApiKey = process.env.KAVITA_ADMIN_APIKEY ?? '';
  const flaresolverrUrl = process.env.FLARESOLVERR_URL ?? '';
  const libraryFile = resolve(
    process.env.LIBRARY_FILE ?? './eng_config/manga_library.json',
  );
  if (process.env.LIB_PATH && !process.env.LIBRARY_FILE) {
    // Flask read LIB_PATH; ignoring it silently would start an empty library.
    Logger.warn(
      `LIB_PATH is set but no longer read; using ${libraryFile}. ` +
        'Rename it to LIBRARY_FILE if your library lives elsewhere.',
      'Configuration',
    );
  }

  return {
    port: intEnv('PORT', 5000, 0),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    storage: {
      downloadRoot: resolve(process.env.DOWNLOAD_ROOT ?? './downloaded'),
      libraryFile,
      thumbnailsDir: resolve(process.env.THUMBNAILS_DIR ?? './thumbnails'),
      queueFile: resolve(
        process.env.QUEUE_FILE || join(dirname(libraryFile), 'queue.json'),
      ),
    },
    concurrency: {
      workers: intEnv('NUMBER_OF_WORKERS', 2, 1),
    },
    download: {
      imageConcurrency: intEnv('IMAGE_CONCURRENCY', 1, 1),
      imageDelayMs: intEnv('IMAGE_DELAY_MS', 1000, 0),
      progressIntervalMs: intEnv('DOWNLOAD_PROGRESS_INTERVAL_MS', 10000, 0),
    },
    searchCache: {
      ttlMs: intEnv('SEARCH_CACHE_TTL_MS', 1_800_000, 1), // 30 min
      maxEntries: intEnv('SEARCH_CACHE_MAX_ENTRIES', 500, 1),
    },
    kavita: {
      baseUrl: kavitaBaseUrl,
      exposeUrl: kavitaExposeUrl,
      adminApiKey: kavitaApiKey,
      libId: intEnv('KAVITA_LIB_ID', 1, 0),
      // Same rule as Flask: all three must be set, or calls go to a relative URL.
      enabled: [kavitaBaseUrl, kavitaExposeUrl, kavitaApiKey].every(
        (v) => v.length > 0,
      ),
    },
    flaresolverr: {
      url: flaresolverrUrl,
      enabled: flaresolverrUrl.length > 0,
    },
    security: {
      adminToken: (process.env.ADMIN_TOKEN ?? '').trim(),
      corsOrigins: (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0),
    },
    python: {
      executable: process.env.PYTHON_EXECUTABLE ?? 'python',
      cliScript: resolve(process.env.PYTHON_CLI_SCRIPT ?? '../scrape_cli.py'),
      workingDir: resolve(process.env.PYTHON_WORKING_DIR ?? '..'),
      timeoutMs: intEnv('PYTHON_TIMEOUT_MS', 180_000, 1),
    },
  };
};
