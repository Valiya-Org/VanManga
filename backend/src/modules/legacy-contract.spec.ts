import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { createValidationPipe } from '../common/pipes/validation.pipe';
import { DownloadController } from './download/download.controller';
import { DownloadService } from './download/download.service';
import { TaskQueueService } from './download/queue/task-queue.service';
import { ThumbnailService } from './filesystem/thumbnail.service';
import { LibraryLegacyController } from './library/library-legacy.controller';
import { LibraryService } from './library/library.service';
import { ScraperLegacyController } from './scraper/scraper-legacy.controller';
import { ScraperService } from './scraper/scraper.service';

/** Characterisation of the legacy /api/dogemanga/* surface the current
 *  frontend relies on. P2 must not change any of these status codes or
 *  bodies; P4 deletes the routes together with this file. */

const MANGA = {
  manga_id: '-abc',
  manga_name: 'Name',
  artist_name: 'Artist',
  newest_epi: '第1话',
  thumbnail: 'http://old-host:5000/api/dogemanga/thumbnail?mid=-abc',
  last_epi: 1,
  last_epi_name: '',
  completed: false,
  serialization: 0,
  download_switch: 0,
  add_date: 1700000000.5,
  kavita_url: 'None',
};

const TASK = {
  id: 't1',
  kind: 'full-manga',
  mangaId: '-abc',
  status: 'running',
  enqueuedAt: 1,
};

describe('Legacy /api/dogemanga/* contract (unchanged in P2)', () => {
  let app: INestApplication;
  const library = {
    list: jest.fn(() => [MANGA]),
    shortList: jest.fn(() => [{ manga_id: '-abc', manga_name: 'Name' }]),
    paginate: jest.fn(() => ({ start: 1, limit: 10, count: 1, previous: '', next: '', lib_paginate: [MANGA] })),
    searchInLibrary: jest.fn(() => [MANGA]),
    addManga: jest.fn(),
    toggleAutoUpdate: jest.fn(async () => 1),
    deleteManga: jest.fn(async () => true),
    get: jest.fn(() => ({ ...MANGA, source: 'dgmanga' })),
    has: jest.fn(() => true),
  };
  const taskQueue = { isMangaBusy: jest.fn(() => false) };
  const download = {
    submitFullManga: jest.fn(() => ({ id: 't1' })),
    submitRedownload: jest.fn(() => ({ id: 't2' })),
    submitRezip: jest.fn(() => ({ id: 't3' })),
    current: jest.fn(() => TASK),
    pending: jest.fn(() => [TASK]),
  };
  const scraper = { search: jest.fn(), getChapters: jest.fn() };
  const emitter = { emit: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LibraryLegacyController, DownloadController, ScraperLegacyController],
      providers: [
        { provide: LibraryService, useValue: library },
        { provide: ThumbnailService, useValue: { getThumbnailPath: jest.fn() } },
        { provide: TaskQueueService, useValue: taskQueue },
        { provide: EventEmitter2, useValue: emitter },
        { provide: DownloadService, useValue: download },
        { provide: ScraperService, useValue: scraper },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    taskQueue.isMangaBusy.mockReturnValue(false);
  });

  const http = () => request(app.getHttpServer());

  it('POST lib returns raw records with HTTP 201', async () => {
    await http().post('/api/dogemanga/lib').expect(201, { data: [MANGA], code: 200 });
  });

  it('POST shortlib / libpagination and GET libsearch keep their bodies', async () => {
    await http()
      .post('/api/dogemanga/shortlib')
      .expect(201, { data: [{ manga_id: '-abc', manga_name: 'Name' }], code: 200 });
    const page = await http().post('/api/dogemanga/libpagination').send({ start: 1, limit: 10 }).expect(201);
    expect(page.body.code).toBe(200);
    expect(page.body.data.lib_paginate).toEqual([MANGA]);
    await http().get('/api/dogemanga/libsearch?query=Na').expect(200, { data: [MANGA], code: 200 });
  });

  describe('POST confirm', () => {
    const body = {
      manga_object: { manga_id: '-abc', manga_name: 'Name', artist_name: 'A', newest_epi: '1', thumbnail: 'QQ==' },
      submit_sign: '0',
    };

    it('added → submitted and fires manga.added', async () => {
      library.addManga.mockResolvedValue({ status: 'added', manga: MANGA });
      await http().post('/api/dogemanga/confirm').send(body).expect(201, { data: 'submitted', code: 200 });
      expect(emitter.emit).toHaveBeenCalledWith('manga.added', { mangaId: '-abc' });
      expect(library.addManga).toHaveBeenCalledWith(
        expect.objectContaining({ manga_id: '-abc', thumbnail: 'QQ==', submit_sign: '0' }),
      );
    });

    it('duplicate → 409 inside a 201 body', async () => {
      library.addManga.mockResolvedValue({ status: 'duplicate', duplicates: ['Nam'] });
      await http().post('/api/dogemanga/confirm').send(body).expect(201, { data: { duplicates: ['Nam'] }, code: 409 });
    });

    it('exists / expired / cancelled', async () => {
      library.addManga.mockResolvedValue({ status: 'exists' });
      await http().post('/api/dogemanga/confirm').send(body).expect(201, { data: 'already-in-library', code: 200 });
      library.addManga.mockResolvedValue({ status: 'expired' });
      await http().post('/api/dogemanga/confirm').send(body).expect(201, { data: 'search-expired', code: 410 });
      library.addManga.mockResolvedValue({ status: 'cancelled' });
      await http().post('/api/dogemanga/confirm').send(body).expect(201, { data: 'cancelled', code: 200 });
    });
  });

  it('POST downloadswitch', async () => {
    await http()
      .post('/api/dogemanga/downloadswitch')
      .send({ manga_id: '-abc' })
      .expect(201, { data: { currentDownloadStatus: 1 }, code: 200 });
  });

  describe('DELETE deletemanga', () => {
    it('succeeds with HTTP 200', async () => {
      await http().delete('/api/dogemanga/deletemanga').send({ manga_id: '-abc' }).expect(200, { data: true, code: 200 });
    });

    it('answers 424 in body when the folder could not be removed', async () => {
      library.deleteManga.mockResolvedValueOnce(false);
      await http().delete('/api/dogemanga/deletemanga').send({ manga_id: '-abc' }).expect(200, { data: false, code: 424 });
    });

    it('busy → HTTP 409 with the envelope nested under message', async () => {
      taskQueue.isMangaBusy.mockReturnValue(true);
      const res = await http().delete('/api/dogemanga/deletemanga').send({ manga_id: '-abc' }).expect(409);
      expect(res.body).toEqual({
        statusCode: 409,
        timestamp: expect.any(String),
        path: '/api/dogemanga/deletemanga',
        message: { data: false, code: 434 },
      });
      expect(library.deleteManga).not.toHaveBeenCalled();
    });

    it('missing manga_id → HTTP 404 in the legacy error shape', async () => {
      const res = await http().delete('/api/dogemanga/deletemanga').send({}).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, path: '/api/dogemanga/deletemanga' });
      expect(res.body.message).toMatchObject({ message: 'manga_id missing', statusCode: 404 });
    });
  });

  it('GET rezip', async () => {
    await http()
      .get('/api/dogemanga/rezip')
      .expect(200, { data: 'Re zip downloaded document begin', code: 200, taskId: 't3' });
  });

  it('GET cdl / dlqueue', async () => {
    await http().get('/api/dogemanga/cdl').expect(200, { data: '-abc', code: 200 });
    await http().get('/api/dogemanga/dlqueue').expect(200, { data: [TASK], code: 200 });
  });

  it('POST redownload accepts the stringified tuple list', async () => {
    await http()
      .post('/api/dogemanga/redownload')
      .send({ manga_id: '-abc', selected_array: JSON.stringify([['第1话', 'https://x/1']]) })
      .expect(201, { data: { taskId: 't2' }, code: 200 });
    expect(download.submitRedownload).toHaveBeenCalledWith('-abc', [
      { index: 1, title: '第1话', url: 'https://x/1' },
    ]);
  });

  it('GET confirmmanga returns chapter_title/chapter_link pairs', async () => {
    scraper.getChapters.mockResolvedValue({ chapters: [{ index: 1, title: 'c1', url: 'u1' }] });
    await http()
      .get('/api/dogemanga/confirmmanga?manga_id=-abc')
      .expect(200, { data: [{ chapter_title: 'c1', chapter_link: 'u1' }], code: 200 });
    scraper.getChapters.mockResolvedValue({ chapters: [], errorCode: 501 });
    await http().get('/api/dogemanga/confirmmanga?manga_id=-abc').expect(200, { data: 'error', code: 501 });
  });

  it('GET search: 456 empty name, 457 nothing found, 200 with base64 results', async () => {
    await http().get('/api/dogemanga/search?manga_name=').expect(200, { data: 'manga_name should not be empty!', code: 456 });
    scraper.search.mockRejectedValueOnce(new Error('457'));
    await http().get('/api/dogemanga/search?manga_name=x').expect(200, { data: 'No manga searched.', code: 457 });
    scraper.search.mockResolvedValueOnce([{ manga_id: '-abc', thumbnail: 'QQ==' }]);
    await http()
      .get('/api/dogemanga/search?manga_name=x')
      .expect(200, { data: [{ manga_id: '-abc', thumbnail: 'QQ==' }], code: 200 });
  });
});
