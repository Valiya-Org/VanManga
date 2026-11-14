import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { MangaNotFoundException } from '../../common/http/api-exception';
import { createValidationPipe } from '../../common/pipes/validation.pipe';
import { LibraryService } from '../library/library.service';
import { PythonRunnerError } from '../scraper/python/python-runner.types';
import { ScraperService } from '../scraper/scraper.service';
import { DownloadController } from './download.controller';
import { DownloadService } from './download.service';

const ACTIVE = { id: 't1', kind: 'full-manga', mangaId: '-abc', status: 'running', enqueuedAt: 1, startedAt: 2 };
const PENDING = { id: 't2', kind: 'rezip', status: 'pending', enqueuedAt: 3 };

describe('DownloadController (canonical)', () => {
  let app: INestApplication;
  const download = {
    submitFullManga: jest.fn(() => ({ id: 't1' })),
    submitRedownload: jest.fn(() => ({ id: 't2' })),
    submitRezip: jest.fn(() => ({ id: 't3' })),
    current: jest.fn((): unknown => ACTIVE),
    snapshot: jest.fn(() => ({ active: ACTIVE, pending: [PENDING] })),
  };
  const library = { get: jest.fn(() => ({ manga_id: '-abc', source: 'dgmanga' })) };
  const scraper = { getChapters: jest.fn() };
  let adminToken = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DownloadController],
      providers: [
        { provide: ConfigService, useValue: { get: () => adminToken } },
        { provide: DownloadService, useValue: download },
        { provide: LibraryService, useValue: library },
        { provide: ScraperService, useValue: scraper },
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
    adminToken = '';
  });

  const http = () => request(app.getHttpServer());

  it('POST /download queues a full download with HTTP 200', async () => {
    await http().post('/api/download').send({ manga_id: '-abc' }).expect(200, { code: 200, data: { taskId: 't1' } });
    expect(download.submitFullManga).toHaveBeenCalledWith('-abc');
  });

  it('POST /download for an unknown manga → 404 manga-not-found', async () => {
    download.submitFullManga.mockImplementationOnce(() => {
      throw new MangaNotFoundException('zz');
    });
    const res = await http().post('/api/download').send({ manga_id: 'zz' }).expect(404);
    expect(res.body.error).toBe('manga-not-found');
  });

  it('POST /download/chapters validates and queues', async () => {
    const chapters = [{ index: 2, title: '第2话', url: 'https://x/2' }];
    await http()
      .post('/api/download/chapters')
      .send({ manga_id: '-abc', chapters })
      .expect(200, { code: 200, data: { taskId: 't2' } });
    expect(download.submitRedownload).toHaveBeenCalledWith('-abc', chapters);

    const bad = await http().post('/api/download/chapters').send({ manga_id: '-abc', chapters: [] }).expect(400);
    expect(bad.body.error).toBe('validation-failed');
  });

  it('POST /library/rezip', async () => {
    await http().post('/api/library/rezip').expect(200, { code: 200, data: { taskId: 't3' } });
  });

  it('POST /library/rezip requires X-Admin-Token when ADMIN_TOKEN is set', async () => {
    adminToken = 's3cret';
    const res = await http().post('/api/library/rezip').expect(401);
    expect(res.body.error).toBe('admin-token-required');
    expect(download.submitRezip).not.toHaveBeenCalled();
    await http().post('/api/library/rezip').set('X-Admin-Token', 's3cret').expect(200);
  });

  it('GET /download/queue returns the snapshot', async () => {
    await http()
      .get('/api/download/queue')
      .expect(200, { code: 200, data: { active: ACTIVE, pending: [PENDING] } });
  });

  it('GET /download/current returns the active task or null', async () => {
    await http().get('/api/download/current').expect(200, { code: 200, data: ACTIVE });
    download.current.mockReturnValueOnce(null);
    await http().get('/api/download/current').expect(200, { code: 200, data: null });
  });

  describe('GET /library/:mangaId/chapters', () => {
    it('reads the path parameter and returns Chapter[]', async () => {
      const chapters = [{ index: 1, title: 'c1', url: 'u1' }];
      scraper.getChapters.mockResolvedValue({ chapters });
      await http().get('/api/library/-abc/chapters').expect(200, { code: 200, data: chapters });
      expect(library.get).toHaveBeenCalledWith('-abc');
      expect(scraper.getChapters).toHaveBeenCalledWith('dgmanga', '-abc');
    });

    it('unknown manga → 404', async () => {
      library.get.mockImplementationOnce(() => {
        throw new MangaNotFoundException('zz');
      });
      const res = await http().get('/api/library/zz/chapters').expect(404);
      expect(res.body.error).toBe('manga-not-found');
    });

    it('CF wall → 502 scraper-blocked, DMCA → 451, runner failure → 502 scraper-failed', async () => {
      scraper.getChapters.mockResolvedValueOnce({ chapters: [], errorCode: 501 });
      expect((await http().get('/api/library/-abc/chapters').expect(502)).body.error).toBe('scraper-blocked');
      scraper.getChapters.mockResolvedValueOnce({ chapters: [], errorCode: 504 });
      expect((await http().get('/api/library/-abc/chapters').expect(451)).body.error).toBe('dmca');
      scraper.getChapters.mockRejectedValueOnce(new PythonRunnerError('boom'));
      expect((await http().get('/api/library/-abc/chapters').expect(502)).body.error).toBe('scraper-failed');
    });
  });
});
