import { DownloadOrchestratorService } from './download-orchestrator.service';
import type { Manga } from '../library/entities/manga.entity';
import { TaskKind, type TaskPayload } from './queue/task.types';

/** Fresh record as MangaFactoryService builds it: last_epi starts at 1
 *  (legacy schema) even though nothing has been downloaded yet. */
function newManga(overrides: Partial<Manga> = {}): Manga {
  return {
    manga_id: 'E8uHNgs8',
    manga_name: 'Test Manga',
    artist_name: 'a',
    newest_epi: '第1话',
    thumbnail: 't',
    last_epi: 1,
    last_epi_name: '',
    completed: false,
    serialization: 0,
    download_switch: 0,
    add_date: 0,
    kavita_url: 'None',
    source: 'dgmanga',
    ...overrides,
  } as Manga;
}

interface SetupOptions {
  /** Per-call results for scraper.getChapterImages (last one repeats). */
  chapterImages?: Array<{ imageUrls?: string[]; errorCode?: number }>;
  /** Result of imageDownloader.downloadChapter. */
  download?: { succeeded: unknown[]; failed: unknown[] };
  /** Overrides scraper.getChapters. */
  getChapters?: () => Promise<unknown>;
}

function setup(
  manga: Manga,
  chapterTitles: string[],
  options: SetupOptions = {},
) {
  let record = { ...manga };
  let deleted = false;
  let executor!: (p: TaskPayload) => Promise<void>;

  const library = {
    get: jest.fn(() => {
      if (deleted) throw new Error(`Unknown manga: ${record.manga_id}`);
      return { ...record };
    }),
    patch: jest.fn(async (_id: string, patch: Partial<Manga>) => {
      record = { ...record, ...patch };
    }),
    deleteManga: jest.fn(async () => {
      deleted = true;
      return true;
    }),
  };
  const events = {
    emitDownloading: jest.fn(),
    emitResponse: jest.fn(),
    emitComplete: jest.fn(),
    emitDmcaAlert: jest.fn(),
    emitDownloadStarted: jest.fn(),
    emitDownloadProgress: jest.fn(),
    emitChapterCompleted: jest.fn(),
    emitDownloadCompleted: jest.fn(),
  };
  const chapters = chapterTitles.map((title, i) => ({
    index: i + 1,
    title,
    url: `https://example.test/p/${i + 1}`,
  }));

  const imageResults = options.chapterImages ?? [{}];
  let imageCall = 0;
  const getChapterImages = jest.fn(async () => {
    const r = imageResults[Math.min(imageCall++, imageResults.length - 1)];
    return {
      imageUrls: r.imageUrls ?? ['https://example.test/1.jpg'],
      requestHeaders: {},
      errorCode: r.errorCode,
    };
  });
  const downloadChapter = jest.fn(
    async () => options.download ?? { succeeded: [{}], failed: [] },
  );
  const fsService = {
    ensureMangaTree: jest.fn(async () => ({ innerDir: '/dl/inner' })),
    chapterDir: jest.fn((dir: string, t: string) => `${dir}/${t}`),
    removeDir: jest.fn(async () => undefined),
  };
  const archive = { zipChapter: jest.fn(async () => undefined) };
  const eventEmitter = { emit: jest.fn() };

  const svc = new DownloadOrchestratorService(
    { registerExecutor: (fn: typeof executor) => (executor = fn) } as never,
    {
      getMetadata: jest.fn(async () => ({
        chapterCount: chapters.length,
        serialization: 0,
      })),
      getChapters: jest.fn(options.getChapters ?? (async () => ({ chapters }))),
      getChapterImages,
    } as never,
    { downloadChapter } as never,
    fsService as never,
    archive as never,
    library as never,
    eventEmitter as never,
    events as never,
    { get: jest.fn(() => 1) } as never,
  );
  svc.onModuleInit();
  // Backoff waits are real time in production; skip them in tests.
  const sleep = jest
    .spyOn(svc as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep')
    .mockResolvedValue(undefined);

  const runFull = () =>
    executor({ kind: TaskKind.FULL_MANGA, mangaId: manga.manga_id });
  const runRedownload = (picked = chapters) =>
    executor({
      kind: TaskKind.REDOWNLOAD,
      mangaId: manga.manga_id,
      chapters: picked,
    });

  return {
    runFull,
    runRedownload,
    events,
    eventEmitter,
    fsService,
    archive,
    getChapterImages,
    sleep,
    library,
    record: () => record,
  };
}

const NOW_MS = 1_800_000_000_000;
const NOW_S = 1_800_000_000;

describe('DownloadOrchestratorService — canonical socket events and updated_at', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW_MS));
  afterEach(() => jest.restoreAllMocks());

  it('emits started → progress → chapter_completed … → completed for a full download', async () => {
    const t = setup(newManga({ add_date: 1000 }), ['第1话', '第2话']);
    await t.runFull();

    expect(t.events.emitDownloadStarted).toHaveBeenCalledWith({ manga_id: 'E8uHNgs8', kind: 'full-manga' });
    expect(t.events.emitDownloadProgress.mock.calls.map((c) => c[0])).toEqual([
      { manga_id: 'E8uHNgs8', chapters_total: 2, chapters_done: 0, chapters_failed: 0 },
      { manga_id: 'E8uHNgs8', chapters_total: 2, chapters_done: 1, chapters_failed: 0 },
      { manga_id: 'E8uHNgs8', chapters_total: 2, chapters_done: 2, chapters_failed: 0 },
    ]);
    expect(t.events.emitChapterCompleted.mock.calls.map((c) => c[0])).toEqual([
      { manga_id: 'E8uHNgs8', chapter_index: 1, chapter_title: '第1话', last_epi: 1, last_epi_name: '第1话', updated_at: NOW_S },
      { manga_id: 'E8uHNgs8', chapter_index: 2, chapter_title: '第2话', last_epi: 2, last_epi_name: '第2话', updated_at: NOW_S },
    ]);
    expect(t.events.emitDownloadCompleted).toHaveBeenCalledTimes(1);
    const done = t.events.emitDownloadCompleted.mock.calls[0][0];
    expect(done).toMatchObject({
      manga_id: 'E8uHNgs8',
      kind: 'full-manga',
      status: 'done',
      chapters_total: 2,
      chapters_failed: 0,
    });
    expect(done.manga).toMatchObject({
      completed: true,
      last_epi: 2,
      updated_at: NOW_S,
      add_date: 1000,
      thumbnail: '/api/library/E8uHNgs8/thumbnail',
    });

    // legacy events still fire alongside
    expect(t.events.emitDownloading).toHaveBeenCalledWith('E8uHNgs8');
    expect(t.events.emitResponse).toHaveBeenCalledTimes(2);
    expect(t.events.emitComplete).toHaveBeenCalledTimes(1);
  });

  it('writes updated_at when last_epi advances and on completion, never touches add_date', async () => {
    const t = setup(newManga({ add_date: 1000 }), ['第1话']);
    await t.runFull();
    const patches = t.library.patch.mock.calls.map((c) => c[1] as Partial<Manga>);
    expect(patches.find((p) => p.last_epi === 1)).toMatchObject({ updated_at: NOW_S });
    expect(patches.find((p) => p.completed === true)).toMatchObject({ updated_at: NOW_S });
    expect(patches.some((p) => 'add_date' in p)).toBe(false);
    expect(t.record().add_date).toBe(1000);
  });

  it('reports a run where every chapter failed as failed, without writing updated_at', async () => {
    const t = setup(newManga(), ['第1话', '第2话'], { chapterImages: [{ errorCode: 503 }] });
    await t.runFull();
    expect(t.events.emitDownloadCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', chapters_total: 2, chapters_failed: 2 }),
    );
    expect(t.record().updated_at).toBeUndefined();
    expect(t.events.emitChapterCompleted).not.toHaveBeenCalled();
  });

  it('emits nothing download-related when the manga is already up to date', async () => {
    const t = setup(newManga({ completed: true, last_epi: 5 }), ['a', 'b']);
    await t.runFull();
    expect(t.events.emitDownloadStarted).not.toHaveBeenCalled();
    expect(t.events.emitDownloadCompleted).not.toHaveBeenCalled();
  });

  it('a chapter list blocked by Cloudflare ends the started run as failed', async () => {
    const t = setup(newManga(), ['a'], { getChapters: async () => ({ chapters: [], errorCode: 501 }) });
    await t.runFull();
    expect(t.events.emitDownloadStarted).toHaveBeenCalled();
    expect(t.events.emitDownloadCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', chapters_total: 0 }),
    );
    expect(t.events.emitComplete).toHaveBeenCalledTimes(1);
  });

  it('a DMCA chapter list deletes the manga, alerts and completes with manga: null', async () => {
    const t = setup(newManga(), ['a'], { getChapters: async () => ({ chapters: [], errorCode: 504 }) });
    await t.runFull();
    expect(t.library.deleteManga).toHaveBeenCalledWith('E8uHNgs8');
    expect(t.events.emitDmcaAlert).toHaveBeenCalledWith({ manga_id: 'E8uHNgs8', manga_name: 'Test Manga' });
    expect(t.events.emitDownloadCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', manga: null }),
    );
  });

  it('a crash mid-run still ends the run (failed) and propagates the error', async () => {
    const t = setup(newManga(), ['a'], {
      getChapters: async () => {
        throw new Error('python died');
      },
    });
    await expect(t.runFull()).rejects.toThrow('python died');
    expect(t.events.emitDownloadCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
    expect(t.events.emitComplete).toHaveBeenCalledTimes(1);
  });

  it('redownload: chapter_completed keeps last_epi, completion writes updated_at', async () => {
    const t = setup(
      newManga({ completed: true, last_epi: 2, last_epi_name: '第2话', add_date: 1000 }),
      ['第1话', '第2话'],
    );
    await t.runRedownload();
    expect(t.events.emitDownloadStarted).toHaveBeenCalledWith({ manga_id: 'E8uHNgs8', kind: 'redownload' });
    expect(t.events.emitChapterCompleted.mock.calls.map((c) => c[0].last_epi)).toEqual([2, 2]);
    expect(t.events.emitDownloadCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'redownload', status: 'done', chapters_total: 2 }),
    );
    expect(t.record()).toMatchObject({ updated_at: NOW_S, add_date: 1000, last_epi: 2 });
  });
});

describe('DownloadOrchestratorService — chapter start spacing (F10)', () => {
  it('waits 2–5 s before starting each chapter after the first', async () => {
    const t = setup(newManga(), ['a', 'b', 'c']);
    await t.runFull();
    const waits = t.sleep.mock.calls.map((c) => c[0] as number);
    expect(waits).toHaveLength(2);
    for (const ms of waits) {
      expect(ms).toBeGreaterThanOrEqual(2000);
      expect(ms).toBeLessThanOrEqual(5000);
    }
  });

  it('does not wait before a single chapter', async () => {
    const t = setup(newManga(), ['a']);
    await t.runFull();
    expect(t.sleep).not.toHaveBeenCalled();
  });
});

describe('DownloadOrchestratorService — full manga download', () => {
  it('records chapter 1 of a newly added manga and emits response', async () => {
    const t = setup(newManga(), ['第1话']);
    await t.runFull();

    expect(t.record()).toMatchObject({
      last_epi: 1,
      last_epi_name: '第1话',
      completed: true,
    });
    expect(t.events.emitResponse).toHaveBeenCalledWith({
      manga_id: 'E8uHNgs8',
      last_epi: 1,
      last_epi_name: '第1话',
    });
    expect(t.events.emitComplete).toHaveBeenCalledTimes(1);
  });

  it('advances through every chapter of a new multi-chapter manga', async () => {
    const t = setup(newManga(), ['第1话', '第2话', '第3话']);
    await t.runFull();

    expect(t.record()).toMatchObject({ last_epi: 3, last_epi_name: '第3话' });
    expect(t.events.emitResponse.mock.calls.map((c) => c[0].last_epi)).toEqual(
      [1, 2, 3],
    );
  });

  it('only records chapters past last_epi for an already-downloaded manga', async () => {
    const t = setup(
      newManga({ completed: true, last_epi: 2, last_epi_name: '第2话' }),
      ['第1话', '第2话', '第3话'],
    );
    await t.runFull();

    expect(t.record()).toMatchObject({ last_epi: 3, last_epi_name: '第3话' });
    expect(t.events.emitResponse).toHaveBeenCalledTimes(1);
    expect(t.events.emitResponse.mock.calls[0][0].last_epi).toBe(3);
  });
});

describe('DownloadOrchestratorService — parity with the Flask pipeline', () => {
  it('names the chapter folder with the legacy reformatted title', async () => {
    const t = setup(newManga(), ['第68-69话']);
    await t.runFull();

    expect(t.fsService.chapterDir).toHaveBeenCalledWith(
      '/dl/inner',
      '第68-第69话',
    );
    expect(t.record().last_epi_name).toBe('第68-第69话');
  });

  it('retries a chapter whose page is rate limited (429) instead of dropping it', async () => {
    const t = setup(newManga(), ['第1话'], {
      chapterImages: [{ errorCode: 429 }, { errorCode: 429 }, {}],
    });
    await t.runFull();

    expect(t.getChapterImages).toHaveBeenCalledTimes(3);
    expect(t.sleep).toHaveBeenCalledTimes(2);
    expect(t.archive.zipChapter).toHaveBeenCalledTimes(1);
    expect(t.record()).toMatchObject({ last_epi: 1, completed: true });
  });

  it('gives up on a chapter that stays rate limited', async () => {
    const t = setup(newManga(), ['第1话'], {
      chapterImages: [{ errorCode: 429 }],
    });
    await t.runFull();

    expect(t.getChapterImages).toHaveBeenCalledTimes(6);
    expect(t.archive.zipChapter).not.toHaveBeenCalled();
  });

  it('does not zip or record a chapter with 10 or more failed images', async () => {
    const failed = Array.from({ length: 10 }, () => ({
      job: { url: 'u' },
      reason: 'HTTP 500',
    }));
    const t = setup(newManga({ completed: true, last_epi: 1 }), ['a', 'b'], {
      download: { succeeded: [], failed },
    });
    await t.runFull();

    expect(t.archive.zipChapter).not.toHaveBeenCalled();
    expect(t.fsService.removeDir).toHaveBeenCalledWith('/dl/inner/b');
    expect(t.record().last_epi).toBe(1);
    expect(t.events.emitResponse).not.toHaveBeenCalled();
  });

  it('still zips a chapter with fewer than 10 failed images', async () => {
    const failed = [{ job: { url: 'u' }, reason: 'HTTP 500' }];
    const t = setup(newManga(), ['第1话'], {
      download: { succeeded: [{}], failed },
    });
    await t.runFull();

    expect(t.archive.zipChapter).toHaveBeenCalledTimes(1);
  });

  it('does not mark a manga completed when every chapter failed', async () => {
    const t = setup(newManga(), ['第1话', '第2话'], {
      chapterImages: [{ errorCode: 503 }],
    });
    await t.runFull();

    expect(t.record().completed).toBe(false);
    expect(t.eventEmitter.emit).not.toHaveBeenCalled();
    // The UI still needs to leave its "downloading" state.
    expect(t.events.emitComplete).toHaveBeenCalledTimes(1);
  });

  it('asks Kavita to rescan after a redownload', async () => {
    const t = setup(
      newManga({ completed: true, last_epi: 2, last_epi_name: '第2话' }),
      ['第1话', '第2话'],
    );
    await t.runRedownload();

    expect(t.eventEmitter.emit).toHaveBeenCalledWith('download.completed', {
      mangaId: 'E8uHNgs8',
      mangaName: 'Test Manga',
    });
    // A redownload never moves the newest-episode marker.
    expect(t.record().last_epi).toBe(2);
  });
});
