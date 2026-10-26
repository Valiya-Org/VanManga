import axios from 'axios';
import type { Manga } from '../library/entities/manga.entity';
import { SchedulerService } from './scheduler.service';

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
const axiosGet = (axios as unknown as { get: jest.Mock }).get;

function manga(id: string, overrides: Partial<Manga> = {}): Manga {
  return {
    manga_id: id,
    manga_name: `name-${id}`,
    artist_name: 'a',
    newest_epi: '',
    thumbnail: '',
    last_epi: 5,
    last_epi_name: '第5话',
    completed: true,
    serialization: 0,
    download_switch: 0,
    add_date: 0,
    kavita_url: 'None',
    source: 'dgmanga',
    ...overrides,
  } as Manga;
}

function setup(
  library: Manga[],
  opts: { kavitaEnabled?: boolean; cfEnabled?: boolean } = {},
) {
  const intervals = new Map<string, NodeJS.Timeout>();
  const registry = {
    doesExist: jest.fn((_t: string, k: string) => intervals.has(k)),
    addInterval: jest.fn((k: string, i: NodeJS.Timeout) => intervals.set(k, i)),
    deleteInterval: jest.fn((k: string) => {
      clearInterval(intervals.get(k));
      intervals.delete(k);
    }),
  };
  const scraper = { getMetadata: jest.fn() };
  const downloadService = { submitFullManga: jest.fn() };
  const kavita = {
    enabled: opts.kavitaEnabled ?? false,
    syncLibrary: jest.fn(async () => undefined),
  };
  const cloudflare = {
    isEnabled: jest.fn(() => opts.cfEnabled ?? false),
    isCloudflareChallenged: jest.fn(() => false),
    solveChallenge: jest.fn(async () => undefined),
    reset: jest.fn(),
  };

  const svc = new SchedulerService(
    registry as never,
    { list: () => library } as never,
    scraper as never,
    downloadService as never,
    kavita as never,
    cloudflare as never,
    {} as never,
    {} as never,
  );
  // skip the 1s politeness delay between source checks
  jest
    .spyOn(svc as unknown as { sleep: () => Promise<void> }, 'sleep')
    .mockResolvedValue();

  const queued = () =>
    downloadService.submitFullManga.mock.calls.map((c) => c[0] as string);
  const cleanup = () => intervals.forEach((i) => clearInterval(i));
  return { svc, scraper, downloadService, kavita, cloudflare, registry, queued, cleanup };
}

beforeEach(() => axiosGet.mockReset());

describe('SchedulerService daily/boot scan', () => {
  it('queues a manga whose first download never completed, without checking the source', async () => {
    const t = setup([manga('a', { completed: false })]);
    await t.svc.handleDailyScan();
    expect(t.queued()).toEqual(['a']);
    expect(t.scraper.getMetadata).not.toHaveBeenCalled();
  });

  it('skips a series with auto-update off (download_switch=1)', async () => {
    const t = setup([manga('a', { download_switch: 1 })]);
    await t.svc.handleDailyScan();
    expect(t.queued()).toEqual([]);
    expect(t.scraper.getMetadata).not.toHaveBeenCalled();
  });

  it('queues an ongoing series only when the source has more chapters', async () => {
    const t = setup([manga('newer'), manga('same')]);
    t.scraper.getMetadata.mockImplementation(async (_s: string, id: string) => ({
      chapterCount: id === 'newer' ? 6 : 5,
      serialization: 0,
    }));
    await t.svc.handleDailyScan();
    expect(t.queued()).toEqual(['newer']);
  });

  it('skips a manga when the source reports CF wall (501) or DMCA (504)', async () => {
    const t = setup([manga('cf'), manga('dmca')]);
    t.scraper.getMetadata.mockImplementation(async (_s: string, id: string) => ({
      chapterCount: 99,
      serialization: 0,
      errorCode: id === 'cf' ? 501 : 504,
    }));
    await t.svc.handleDailyScan();
    expect(t.queued()).toEqual([]);
  });

  it('keeps scanning after one manga fails', async () => {
    // scanned in reverse, so 'broken' fails first and 'ok' must still be checked
    const t = setup([manga('ok'), manga('broken')]);
    t.scraper.getMetadata.mockImplementation(async (_s: string, id: string) => {
      if (id === 'broken') throw new Error('python exited 1');
      return { chapterCount: 6, serialization: 0 };
    });
    await t.svc.handleDailyScan();
    expect(t.queued()).toEqual(['ok']);
  });

  it('scans newest-added first (reverse library order, like Flask)', async () => {
    const t = setup([manga('first', { completed: false }), manga('second', { completed: false })]);
    await t.svc.handleDailyScan();
    expect(t.queued()).toEqual(['second', 'first']);
  });

  it('uses each manga’s own source', async () => {
    const t = setup([manga('a', { source: 'other' })]);
    t.scraper.getMetadata.mockResolvedValue({ chapterCount: 5, serialization: 0 });
    await t.svc.handleDailyScan();
    expect(t.scraper.getMetadata).toHaveBeenCalledWith('other', 'a');
  });
});

describe('SchedulerService Cloudflare monitor', () => {
  it('does not probe when FlareSolverr is not configured', async () => {
    const t = setup([]);
    await t.svc.handleDailyScan();
    expect(axiosGet).not.toHaveBeenCalled();
    expect(t.registry.addInterval).not.toHaveBeenCalled();
  });

  it('solves the challenge and registers the 12-min monitor when CF is active', async () => {
    const t = setup([], { cfEnabled: true });
    axiosGet.mockResolvedValue({ status: 403, data: 'cf' });
    t.cloudflare.isCloudflareChallenged.mockReturnValue(true);
    await t.svc.handleDailyScan();
    expect(t.cloudflare.solveChallenge).toHaveBeenCalledWith('https://dogemanga.com');
    expect(t.registry.addInterval).toHaveBeenCalledWith('cf-monitor', expect.anything());

    // second scan while still challenged: no duplicate interval
    await t.svc.handleDailyScan();
    expect(t.registry.addInterval).toHaveBeenCalledTimes(1);
    t.cleanup();
  });

  it('resets CF state and removes the monitor once CF is gone', async () => {
    const t = setup([], { cfEnabled: true });
    axiosGet.mockResolvedValue({ status: 403, data: 'cf' });
    t.cloudflare.isCloudflareChallenged.mockReturnValue(true);
    await t.svc.handleDailyScan();

    axiosGet.mockResolvedValue({ status: 200, data: 'ok' });
    t.cloudflare.isCloudflareChallenged.mockReturnValue(false);
    await t.svc.handleDailyScan();
    expect(t.cloudflare.reset).toHaveBeenCalled();
    expect(t.registry.deleteInterval).toHaveBeenCalledWith('cf-monitor');
    t.cleanup();
  });

  it('still scans the library when the CF probe request fails', async () => {
    const t = setup([manga('a', { completed: false })], { cfEnabled: true });
    axiosGet.mockRejectedValue(new Error('ETIMEDOUT'));
    await t.svc.handleDailyScan();
    expect(t.queued()).toEqual(['a']);
  });
});

describe('SchedulerService Kavita sync', () => {
  it('syncs on startup only when Kavita is configured', async () => {
    const on = setup([], { kavitaEnabled: true });
    await on.svc.onModuleInit();
    expect(on.kavita.syncLibrary).toHaveBeenCalledTimes(1);

    const off = setup([], { kavitaEnabled: false });
    await off.svc.onModuleInit();
    expect(off.kavita.syncLibrary).not.toHaveBeenCalled();
    // let the setImmediate boot scans settle
    await new Promise((r) => setImmediate(r));
  });

  it('the 6-hourly job syncs the library', async () => {
    const t = setup([]);
    await t.svc.handleKavitaSync();
    expect(t.kavita.syncLibrary).toHaveBeenCalledTimes(1);
  });
});
