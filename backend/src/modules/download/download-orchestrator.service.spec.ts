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

function setup(manga: Manga, chapterTitles: string[]) {
  let record = { ...manga };
  let executor!: (p: TaskPayload) => Promise<void>;

  const library = {
    get: jest.fn(() => ({ ...record })),
    patch: jest.fn(async (_id: string, patch: Partial<Manga>) => {
      record = { ...record, ...patch };
    }),
  };
  const events = {
    emitDownloading: jest.fn(),
    emitResponse: jest.fn(),
    emitComplete: jest.fn(),
    emitDmcaAlert: jest.fn(),
  };
  const chapters = chapterTitles.map((title, i) => ({
    index: i + 1,
    title,
    url: `https://example.test/p/${i + 1}`,
  }));

  const svc = new DownloadOrchestratorService(
    { registerExecutor: (fn: typeof executor) => (executor = fn) } as never,
    {
      getMetadata: jest.fn(async () => ({
        chapterCount: chapters.length,
        serialization: 0,
      })),
      getChapters: jest.fn(async () => ({ chapters })),
      getChapterImages: jest.fn(async () => ({
        imageUrls: ['https://example.test/1.jpg'],
        requestHeaders: {},
      })),
    } as never,
    {
      downloadChapter: jest.fn(async () => ({ succeeded: [{}], failed: [] })),
    } as never,
    {
      ensureMangaTree: jest.fn(async () => ({ innerDir: '/dl/inner' })),
      chapterDir: jest.fn((dir: string, t: string) => `${dir}/${t}`),
    } as never,
    { zipChapter: jest.fn(async () => undefined) } as never,
    library as never,
    { emit: jest.fn() } as never,
    events as never,
    { get: jest.fn(() => 1) } as never,
  );
  svc.onModuleInit();

  const runFull = () =>
    executor({ kind: TaskKind.FULL_MANGA, mangaId: manga.manga_id });

  return { runFull, events, record: () => record };
}

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
