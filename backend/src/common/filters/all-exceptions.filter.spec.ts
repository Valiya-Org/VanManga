import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Post,
  Body,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request from 'supertest';
import {
  ApiException,
  MangaNotFoundException,
  UnknownSourceException,
} from '../http/api-exception';
import { createValidationPipe } from '../pipes/validation.pipe';
import { AllExceptionsFilter } from './all-exceptions.filter';

class Body1 {
  @IsString() name!: string;
}

@Controller()
class ProbeController {
  @Get('library/api-ex')
  apiEx() {
    throw new ApiException(409, 'duplicate', {
      message: 'looks like X',
      data: { duplicates: ['X'] },
    });
  }

  @Get('library/manga-nf')
  mangaNf() {
    throw new MangaNotFoundException('m1');
  }

  @Get('scraper/source-nf')
  sourceNf() {
    throw new UnknownSourceException('nope', ['dgmanga']);
  }

  @Get('library/plain-404')
  plain404() {
    throw new NotFoundException('gone');
  }

  @Get('library/bad')
  bad() {
    throw new BadRequestException('bad thing');
  }

  @Get('library/boom')
  boom() {
    throw new Error('kaboom');
  }

  @Get('library/boom-with-status')
  boomWithStatus() {
    // Carries a status but is not marked safe to expose.
    throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5000'), { status: 404 });
  }

  @Post('library/validate')
  validate(@Body() body: Body1) {
    return body;
  }

  @Get('dogemanga/conflict')
  legacyConflict() {
    throw new ConflictException({ data: false, code: 434 });
  }

  @Get('dogemanga/manga-nf')
  legacyMangaNf() {
    throw new MangaNotFoundException('m1');
  }
}

describe('AllExceptionsFilter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());

  describe('canonical routes → { code, error, message?, data? }', () => {
    it('ApiException carries status, error, message and data', async () => {
      await http().get('/api/library/api-ex').expect(409, {
        code: 409,
        error: 'duplicate',
        message: 'looks like X',
        data: { duplicates: ['X'] },
      });
    });

    it('MangaNotFoundException → 404 manga-not-found', async () => {
      await http().get('/api/library/manga-nf').expect(404, {
        code: 404,
        error: 'manga-not-found',
        message: 'Unknown manga: m1',
      });
    });

    it('UnknownSourceException → 404 unknown-source', async () => {
      const res = await http().get('/api/scraper/source-nf').expect(404);
      expect(res.body).toMatchObject({ code: 404, error: 'unknown-source' });
    });

    it('plain HttpException maps its status to a default error', async () => {
      await http().get('/api/library/plain-404').expect(404, {
        code: 404,
        error: 'not-found',
        message: 'gone',
      });
      await http().get('/api/library/bad').expect(400, {
        code: 400,
        error: 'bad-request',
        message: 'bad thing',
      });
    });

    it('ValidationPipe failures → 400 validation-failed', async () => {
      const res = await http().post('/api/library/validate').send({}).expect(400);
      expect(res.body.code).toBe(400);
      expect(res.body.error).toBe('validation-failed');
      expect(res.body.message).toContain('name must be a string');
    });

    it('unknown routes → 404 not-found', async () => {
      const res = await http().get('/api/nothing-here').expect(404);
      expect(res.body).toMatchObject({ code: 404, error: 'not-found' });
    });

    it('malformed JSON body → 400 bad-request', async () => {
      const res = await http()
        .post('/api/library/validate')
        .set('Content-Type', 'application/json')
        .send('{"name":')
        .expect(400);
      expect(res.body).toMatchObject({ code: 400, error: 'bad-request' });
    });

    it('oversized body → 413 payload-too-large', async () => {
      // The default parser in this test app has a 100kb limit.
      const res = await http()
        .post('/api/library/validate')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ name: 'x'.repeat(200 * 1024) }))
        .expect(413);
      expect(res.body).toEqual({ code: 413, error: 'payload-too-large' });
    });

    it('non-HTTP errors → 500 internal-error without leaking the message', async () => {
      await http().get('/api/library/boom').expect(500, {
        code: 500,
        error: 'internal-error',
      });
      await http().get('/api/library/boom-with-status').expect(500, {
        code: 500,
        error: 'internal-error',
      });
    });
  });

  describe('legacy /api/dogemanga/* keep the old structure', () => {
    it('nests the thrown response under message', async () => {
      const res = await http().get('/api/dogemanga/conflict').expect(409);
      expect(res.body).toEqual({
        statusCode: 409,
        timestamp: expect.any(String),
        path: '/api/dogemanga/conflict',
        message: { data: false, code: 434 },
      });
    });

    it('errorCode-carrying exceptions look exactly like NotFoundException', async () => {
      const res = await http().get('/api/dogemanga/manga-nf').expect(404);
      expect(res.body.message).toEqual({
        message: 'Unknown manga: m1',
        error: 'Not Found',
        statusCode: 404,
      });
    });
  });
});
