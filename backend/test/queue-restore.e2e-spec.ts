import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import request from 'supertest';

/** Restart recovery (docs/api-contract.md §3.4) through a real boot:
 *  a library file and a queue.json left behind by a previous run are on
 *  disk, the app boots the way main.ts boots it, and every restored task
 *  must run against the loaded library, in order, ahead of what the boot
 *  scan queues. A restored task for a manga that no longer exists is
 *  skipped without stopping the queue. */

const FAKE_CLI = resolve(__dirname, '../src/modules/scraper/python/__fixtures__/fake-cli.cjs');

function manga(id: string, completed: boolean) {
  return {
    manga_id: id,
    manga_name: `Restore ${id}`,
    artist_name: 'Tester',
    newest_epi: '第1话',
    thumbnail: `/api/library/${id}/thumbnail`,
    last_epi: 0,
    last_epi_name: '',
    completed,
    serialization: 0,
    // 1 = the boot scan leaves a completed record alone
    download_switch: 1,
    add_date: 1_700_000_000,
    source: 'dgmanga',
    kavita_url: 'None',
  };
}

describe('Queue restore after a restart (e2e)', () => {
  let app: NestExpressApplication;
  let dir: string;
  let queueFile: string;
  const savedEnv = { ...process.env };
  let started: jest.SpyInstance;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'vanmanga-restore-'));
    const config = join(dir, 'config');
    mkdirSync(config, { recursive: true });
    queueFile = join(config, 'queue.json');

    writeFileSync(
      join(config, 'manga_library.json'),
      JSON.stringify({
        '-r1': manga('-r1', true),
        '-r2': manga('-r2', true),
        // incomplete: the boot scan queues a full download for it
        '-r3': manga('-r3', false),
      }),
    );
    writeFileSync(
      queueFile,
      JSON.stringify({
        version: 1,
        tasks: [
          // the task that was running when the process died
          { id: 't1', payload: { kind: 'full-manga', mangaId: '-r1' }, enqueuedAt: 1 },
          // deleted from the library since
          { id: 't2', payload: { kind: 'full-manga', mangaId: '-gone' }, enqueuedAt: 2 },
          {
            id: 't3',
            payload: {
              kind: 'redownload',
              mangaId: '-r2',
              chapters: [{ index: 1, title: '第1话', url: 'https://example.invalid/ch/1' }],
            },
            enqueuedAt: 3,
          },
        ],
      }),
    );

    Object.assign(process.env, {
      LIBRARY_FILE: join(config, 'manga_library.json'),
      QUEUE_FILE: queueFile,
      DOWNLOAD_ROOT: join(dir, 'downloaded'),
      THUMBNAILS_DIR: join(dir, 'thumbnails'),
      PYTHON_EXECUTABLE: process.execPath,
      PYTHON_CLI_SCRIPT: FAKE_CLI,
      PYTHON_WORKING_DIR: dir,
      KAVITA_BASE_URL: '',
      KAVITA_EXPOSE_URL: '',
      KAVITA_ADMIN_APIKEY: '',
      FLARESOLVERR_URL: '',
    });

    // Spy before the boot: restored tasks may start during app.init().
    const { EventsGateway } = await import('../src/modules/events/events.gateway');
    started = jest.spyOn(EventsGateway.prototype, 'emitDownloadStarted');

    const { createApp } = await import('../src/bootstrap');
    app = await createApp({ logger: ['error'], abortOnError: false });
    await app.init();
  });

  afterAll(async () => {
    started?.mockRestore();
    await app?.close();
    process.env = savedEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());

  async function queueIdle(): Promise<void> {
    for (let i = 0; i < 150; i += 1) {
      const res = await http().get('/api/download/queue').expect(200);
      if (res.body.data.active === null && res.body.data.pending.length === 0) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('queue never became idle');
  }

  it('runs every restored task, in order, before the boot scan’s, and skips a vanished manga', async () => {
    await queueIdle();

    expect(started.mock.calls.map(([payload]) => payload)).toEqual([
      { manga_id: '-r1', kind: 'full-manga' },
      { manga_id: '-r2', kind: 'redownload' },
      { manga_id: '-r3', kind: 'full-manga' },
    ]);

    // The library on disk kept every record (nothing overwrote it with {}),
    // and the restored full download finished against the loaded record:
    // it copied the source's serialization (1 in the fake CLI) into it.
    const stored = JSON.parse(readFileSync(process.env.LIBRARY_FILE!, 'utf8'));
    expect(Object.keys(stored).sort()).toEqual(['-r1', '-r2', '-r3']);
    expect(stored['-r1']).toMatchObject({ completed: true, serialization: 1 });
    expect(stored['-r3']).toMatchObject({ completed: true, serialization: 1 });

    // Everything finished, so the persisted queue is empty.
    const { TaskQueueService } = await import('../src/modules/download/queue/task-queue.service');
    await app.get(TaskQueueService).flushPersistence();
    expect(JSON.parse(readFileSync(queueFile, 'utf8'))).toEqual({ version: 1, tasks: [] });
  });
});
