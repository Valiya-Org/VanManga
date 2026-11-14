import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { UnknownSourceException } from '../../common/http/api-exception';
import { createValidationPipe } from '../../common/pipes/validation.pipe';
import { SearchCacheService } from '../search-cache/search-cache.service';
import { PythonRunnerError } from './python/python-runner.types';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './scraper.service';

const HIT = {
  manga_id: '-abc',
  manga_name: 'N',
  artist_name: 'A',
  newest_epi: '第1话',
  thumbnail: 'QUJD',
  source: 'dgmanga',
};

describe('ScraperController (canonical /api/scraper)', () => {
  let app: INestApplication;
  const scraper = {
    listSources: jest.fn(() => [{ name: 'dgmanga', displayName: 'DogeManga' }]),
    search: jest.fn(),
    getMetadata: jest.fn(),
    getChapters: jest.fn(),
    getChapterImages: jest.fn(),
  };
  const cache = { get: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ScraperController],
      providers: [
        { provide: ScraperService, useValue: scraper },
        { provide: SearchCacheService, useValue: cache },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const http = () => request(app.getHttpServer());

  it('GET /scraper/sources', async () => {
    await http()
      .get('/api/scraper/sources')
      .expect(200, { code: 200, data: [{ name: 'dgmanga', displayName: 'DogeManga' }] });
  });

  describe('search', () => {
    it('wraps results and always returns thumbnail URLs', async () => {
      scraper.search.mockResolvedValue([HIT]);
      await http()
        .get('/api/scraper/dgmanga/search?q=N')
        .expect(200, {
          code: 200,
          data: [{ ...HIT, thumbnail: '/api/scraper/dgmanga/search-thumbnail/-abc' }],
        });
      expect(scraper.search).toHaveBeenCalledWith('dgmanga', 'N');
    });

    it('no results (source status 457) → 200 []', async () => {
      scraper.search.mockRejectedValue(new PythonRunnerError('Source returned status 457', 457));
      await http().get('/api/scraper/dgmanga/search?q=zzz').expect(200, { code: 200, data: [] });
    });

    it('empty or blank q → 400 query-required', async () => {
      for (const url of ['/api/scraper/dgmanga/search', '/api/scraper/dgmanga/search?q=%20']) {
        const res = await http().get(url).expect(400);
        expect(res.body).toMatchObject({ code: 400, error: 'query-required' });
      }
      expect(scraper.search).not.toHaveBeenCalled();
    });

    it('unknown source → 404 unknown-source', async () => {
      scraper.search.mockRejectedValue(new UnknownSourceException('x', ['dgmanga']));
      const res = await http().get('/api/scraper/x/search?q=a').expect(404);
      expect(res.body.error).toBe('unknown-source');
    });

    it('other scraper failures → 502 scraper-failed', async () => {
      scraper.search.mockRejectedValue(new PythonRunnerError('Python CLI timed out after 1ms'));
      const res = await http().get('/api/scraper/dgmanga/search?q=a').expect(502);
      expect(res.body.error).toBe('scraper-failed');
    });
  });

  describe('search-thumbnail', () => {
    it('serves the cached cover as JPEG', async () => {
      cache.get.mockReturnValue(HIT);
      const res = await http().get('/api/scraper/dgmanga/search-thumbnail/-abc').expect(200);
      expect(res.headers['content-type']).toMatch(/image\/jpeg/);
      expect(Buffer.from(res.body as Buffer).toString()).toBe('ABC');
    });

    it('cache miss → 404 thumbnail-not-found', async () => {
      cache.get.mockReturnValue(null);
      await http()
        .get('/api/scraper/dgmanga/search-thumbnail/-abc')
        .expect(404, { code: 404, error: 'thumbnail-not-found' });
    });
  });

  describe('debug passthroughs are enveloped and map sentinels', () => {
    it('metadata', async () => {
      scraper.getMetadata.mockResolvedValueOnce({ chapterCount: 3, serialization: 0 });
      await http()
        .get('/api/scraper/dgmanga/manga/-abc/metadata')
        .expect(200, { code: 200, data: { chapterCount: 3, serialization: 0 } });
      scraper.getMetadata.mockResolvedValueOnce({ chapterCount: 0, serialization: 0, errorCode: 501 });
      expect((await http().get('/api/scraper/dgmanga/manga/-abc/metadata').expect(502)).body.error).toBe(
        'scraper-blocked',
      );
    });

    it('chapters', async () => {
      scraper.getChapters.mockResolvedValueOnce({ chapters: [{ index: 1, title: 't', url: 'u' }] });
      await http()
        .get('/api/scraper/dgmanga/manga/-abc/chapters')
        .expect(200, { code: 200, data: [{ index: 1, title: 't', url: 'u' }] });
    });

    it('chapter-images', async () => {
      scraper.getChapterImages.mockResolvedValueOnce({ chapterTitle: 'c', imageUrls: ['i'], requestHeaders: {} });
      await http()
        .get('/api/scraper/dgmanga/chapter-images?url=u')
        .expect(200, { code: 200, data: { chapterTitle: 'c', imageUrls: ['i'], requestHeaders: {} } });
      scraper.getChapterImages.mockResolvedValueOnce({ chapterTitle: '', imageUrls: [], errorCode: 429 });
      expect((await http().get('/api/scraper/dgmanga/chapter-images?url=u').expect(429)).body.error).toBe(
        'rate-limited',
      );
    });
  });
});
