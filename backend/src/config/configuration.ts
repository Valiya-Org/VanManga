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
