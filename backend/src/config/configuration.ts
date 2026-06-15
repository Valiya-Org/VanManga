import { resolve } from 'path';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  frontend: {
    baseUrl: string;
    websocketUrl: string;
  };
  storage: {
    downloadRoot: string;
    libraryFile: string;
    thumbnailsDir: string;
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
  redis: {
    host: string;
    port: number;
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

export default (): AppConfig => {
  const kavitaApiKey = process.env.KAVITA_ADMIN_APIKEY ?? '';
  const flaresolverrUrl = process.env.FLARESOLVERR_URL ?? '';

  return {
    port: parseInt(process.env.PORT ?? '5000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    frontend: {
      baseUrl: process.env.MANGA_BASE_URL ?? 'http://localhost:5000',
      websocketUrl:
        process.env.MANGA_BASE_WEBSOCKET_URL ?? 'http://localhost:5000',
    },
    storage: {
      downloadRoot: resolve(process.env.DOWNLOAD_ROOT ?? './downloaded'),
      libraryFile: resolve(
        process.env.LIBRARY_FILE ?? './eng_config/manga_library.json',
      ),
      thumbnailsDir: resolve(process.env.THUMBNAILS_DIR ?? './thumbnails'),
    },
    concurrency: {
      workers: parseInt(process.env.NUMBER_OF_WORKERS ?? '2', 10),
    },
    download: {
      imageConcurrency: parseInt(process.env.IMAGE_CONCURRENCY ?? '1', 10),
      imageDelayMs: parseInt(process.env.IMAGE_DELAY_MS ?? '1000', 10),
      progressIntervalMs: parseInt(
        process.env.DOWNLOAD_PROGRESS_INTERVAL_MS ?? '10000',
        10,
      ),
    },
    searchCache: {
      ttlMs: parseInt(process.env.SEARCH_CACHE_TTL_MS ?? '1800000', 10), // 30 min
      maxEntries: parseInt(process.env.SEARCH_CACHE_MAX_ENTRIES ?? '500', 10),
    },
    redis: {
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    },
    kavita: {
      baseUrl: process.env.KAVITA_BASE_URL ?? '',
      exposeUrl: process.env.KAVITA_EXPOSE_URL ?? '',
      adminApiKey: kavitaApiKey,
      libId: parseInt(process.env.KAVITA_LIB_ID ?? '1', 10),
      enabled: kavitaApiKey.length > 0,
    },
    flaresolverr: {
      url: flaresolverrUrl,
      enabled: flaresolverrUrl.length > 0,
    },
    python: {
      executable: process.env.PYTHON_EXECUTABLE ?? 'python',
      cliScript: resolve(process.env.PYTHON_CLI_SCRIPT ?? '../scrape_cli.py'),
      workingDir: resolve(process.env.PYTHON_WORKING_DIR ?? '..'),
      timeoutMs: parseInt(process.env.PYTHON_TIMEOUT_MS ?? '180000', 10),
    },
  };
};
