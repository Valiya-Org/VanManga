import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { MangaNotFoundException } from '../../common/http/api-exception';
import { createValidationPipe } from '../../common/pipes/validation.pipe';
import { TaskQueueService } from '../download/queue/task-queue.service';
import { ThumbnailService } from '../filesystem/thumbnail.service';
import type { Manga } from './entities/manga.entity';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

const STORED: Manga = {
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
  add_date: 1700000000,
  kavita_url: 'None',
};

const VIEW = {
  ...STORED,
  thumbnail: '/api/library/-abc/thumbnail',
  source: 'dgmanga',
  kavita_url: null,
  updated_at: 1700000000,
};

describe('LibraryController (canonical /api/library)', () => {
  let app: INestApplication;
  const library = {
    list: jest.fn(() => [STORED]),
    shortList: jest.fn(() => [{ manga_id: '-abc', manga_name: 'Name' }]),
    paginate: jest.fn(() => ({ start: 1, limit: 10, count: 1, previous: '', next: '', lib_paginate: [STORED] })),
    searchInLibrary: jest.fn(() => [STORED]),
    addManga: jest.fn(),
    toggleAutoUpdate: jest.fn(async () => 1),
    deleteManga: jest.fn(async () => true),
    has: jest.fn(() => true),
  };
  const taskQueue = { isMangaBusy: jest.fn(() => false) };
  const thumbnails = { getThumbnailPath: jest.fn() };
  const emitter = { emit: jest.fn() };
  let adminToken = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LibraryController],
      providers: [
        { provide: ConfigService, useValue: { get: () => adminToken } },
        { provide: LibraryService, useValue: library },
        { provide: ThumbnailService, useValue: thumbnails },
        { provide: TaskQueueService, useValue: taskQueue },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    taskQueue.isMangaBusy.mockReturnValue(false);
    library.has.mockReturnValue(true);
    adminToken = '';
  });

  const http = () => request(app.getHttpServer());

  describe('reads return normalised records', () => {
    it('GET /library', async () => {
      await http().get('/api/library').expect(200, { code: 200, data: [VIEW] });
    });

    it('GET /library/search and /library/paginate', async () => {
      await http().get('/api/library/search?query=Na').expect(200, { code: 200, data: [VIEW] });
      const res = await http().get('/api/library/paginate?start=1&limit=10').expect(200);
      expect(res.body.data.lib_paginate).toEqual([VIEW]);
    });

    it('GET /library/paginate rejects bad params with 400 validation-failed', async () => {
      const res = await http().get('/api/library/paginate?start=0').expect(400);
      expect(res.body).toMatchObject({ code: 400, error: 'validation-failed' });
    });

    it('GET /library/short', async () => {
      await http()
        .get('/api/library/short')
        .expect(200, { code: 200, data: [{ manga_id: '-abc', manga_name: 'Name' }] });
    });
  });

  describe('POST /library (lean add)', () => {
    const lean = { manga_id: '-abc', source: 'dgmanga' };

    it('adds, queues via manga.added and returns the record with HTTP 200', async () => {
      library.addManga.mockResolvedValue({ status: 'added', manga: STORED });
      await http()
        .post('/api/library')
        .send(lean)
        .expect(200, { code: 200, data: { status: 'added', manga: VIEW } });
      expect(emitter.emit).toHaveBeenCalledWith('manga.added', { mangaId: '-abc' });
    });

    it('passes only manga_id, source and submit_sign to the service', async () => {
      library.addManga.mockResolvedValue({ status: 'added', manga: STORED });
      await http()
        .post('/api/library')
        .send({ ...lean, submit_sign: '1', thumbnail: 'QQ==', manga_name: 'X' })
        .expect(200);
      expect(library.addManga).toHaveBeenCalledWith({
        manga_id: '-abc',
        source: 'dgmanga',
        submit_sign: '1',
      });
    });

    it('cancelled', async () => {
      library.addManga.mockResolvedValue({ status: 'cancelled' });
      await http()
        .post('/api/library')
        .send({ ...lean, submit_sign: '2' })
        .expect(200, { code: 200, data: { status: 'cancelled' } });
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('duplicate → 409 with the candidate names', async () => {
      library.addManga.mockResolvedValue({ status: 'duplicate', duplicates: ['Nam'] });
      const res = await http().post('/api/library').send(lean).expect(409);
      expect(res.body).toMatchObject({ code: 409, error: 'duplicate', data: { duplicates: ['Nam'] } });
    });

    it('already in library → 409 with the existing record', async () => {
      library.addManga.mockResolvedValue({ status: 'exists', manga: STORED });
      const res = await http().post('/api/library').send(lean).expect(409);
      expect(res.body).toMatchObject({ code: 409, error: 'already-in-library', data: { manga: VIEW } });
    });

    it('expired search → 410 search-expired', async () => {
      library.addManga.mockResolvedValue({ status: 'expired' });
      const res = await http().post('/api/library').send(lean).expect(410);
      expect(res.body).toMatchObject({ code: 410, error: 'search-expired' });
    });

    it('missing source → 400 validation-failed', async () => {
      const res = await http().post('/api/library').send({ manga_id: '-abc' }).expect(400);
      expect(res.body.error).toBe('validation-failed');
      expect(library.addManga).not.toHaveBeenCalled();
    });
  });

  describe('POST /library/:mangaId/auto-update', () => {
    it('toggles with HTTP 200', async () => {
      await http()
        .post('/api/library/-abc/auto-update')
        .expect(200, { code: 200, data: { currentDownloadStatus: 1 } });
    });

    it('unknown manga → 404 manga-not-found', async () => {
      library.toggleAutoUpdate.mockRejectedValueOnce(new MangaNotFoundException('zz'));
      const res = await http().post('/api/library/zz/auto-update').expect(404);
      expect(res.body).toMatchObject({ code: 404, error: 'manga-not-found' });
    });
  });

  describe('DELETE /library/:mangaId', () => {
    it('deletes', async () => {
      await http().delete('/api/library/-abc').expect(200, { code: 200, data: true });
      expect(library.deleteManga).toHaveBeenCalledWith('-abc');
    });

    it('busy → 409 manga-busy', async () => {
      taskQueue.isMangaBusy.mockReturnValue(true);
      const res = await http().delete('/api/library/-abc').expect(409);
      expect(res.body).toMatchObject({ code: 409, error: 'manga-busy' });
      expect(library.deleteManga).not.toHaveBeenCalled();
    });

    it('unknown → 404 manga-not-found', async () => {
      library.deleteManga.mockRejectedValueOnce(new MangaNotFoundException('zz'));
      const res = await http().delete('/api/library/zz').expect(404);
      expect(res.body.error).toBe('manga-not-found');
    });

    it('with ADMIN_TOKEN set, requires a matching X-Admin-Token', async () => {
      adminToken = 's3cret';
      const missing = await http().delete('/api/library/-abc').expect(401);
      expect(missing.body).toMatchObject({ code: 401, error: 'admin-token-required' });
      const wrong = await http().delete('/api/library/-abc').set('X-Admin-Token', 'nope').expect(401);
      expect(wrong.body).toMatchObject({ code: 401, error: 'admin-token-invalid' });
      expect(library.deleteManga).not.toHaveBeenCalled();

      await http().delete('/api/library/-abc').set('X-Admin-Token', 's3cret').expect(200);
      expect(library.deleteManga).toHaveBeenCalledWith('-abc');
    });

    it('folder removal failed → 500 delete-failed', async () => {
      library.deleteManga.mockResolvedValueOnce(false);
      const res = await http().delete('/api/library/-abc').expect(500);
      expect(res.body).toMatchObject({ code: 500, error: 'delete-failed' });
    });
  });

  describe('GET /library/:mangaId/thumbnail', () => {
    it('unknown manga → 404 thumbnail-not-found without touching the disk', async () => {
      library.has.mockReturnValue(false);
      await http()
        .get('/api/library/zz/thumbnail')
        .expect(404, { code: 404, error: 'thumbnail-not-found' });
      expect(thumbnails.getThumbnailPath).not.toHaveBeenCalled();
    });

    it('missing file → 404 thumbnail-not-found', async () => {
      thumbnails.getThumbnailPath.mockRejectedValueOnce(new Error('nope'));
      await http()
        .get('/api/library/-abc/thumbnail')
        .expect(404, { code: 404, error: 'thumbnail-not-found' });
    });
  });
});
