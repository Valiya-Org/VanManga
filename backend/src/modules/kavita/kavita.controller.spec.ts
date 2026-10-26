import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createValidationPipe } from '../../common/pipes/validation.pipe';
import { KavitaController } from './kavita.controller';
import { KavitaService } from './kavita.service';

describe('KavitaController (HTTP, production ValidationPipe)', () => {
  let app: INestApplication;
  const kavita = {
    enabled: true,
    login: jest.fn(),
    refreshToken: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [KavitaController],
      providers: [{ provide: KavitaService, useValue: kavita }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    kavita.enabled = true;
    kavita.login.mockReset();
    kavita.refreshToken.mockReset();
  });

  it('POST /kavita/login forwards username and password to the service', async () => {
    kavita.login.mockResolvedValue({ apiKey: 'k', jwt: 'j', refreshToken: 'r', loginUrl: 'u' });

    const res = await request(app.getHttpServer())
      .post('/kavita/login')
      .send({ username: 'alice', password: 's3cret' })
      .expect(200);

    expect(kavita.login).toHaveBeenCalledWith('alice', 's3cret');
    expect(res.body).toEqual({
      code: 200,
      data: { apiKey: 'k', jwt: 'j', refreshToken: 'r', loginUrl: 'u' },
    });
  });

  it('POST /kavita/refreshtoken forwards jwt and refreshToken to the service', async () => {
    kavita.refreshToken.mockResolvedValue({ jwt: 'j2', refreshToken: 'r2' });

    await request(app.getHttpServer())
      .post('/kavita/refreshtoken')
      .send({ jwt: 'j1', refreshToken: 'r1' })
      .expect(200);

    expect(kavita.refreshToken).toHaveBeenCalledWith('j1', 'r1');
  });

  it('POST /kavita/login answers 500-in-envelope when Kavita rejects', async () => {
    kavita.login.mockRejectedValue(new Error('401'));
    const res = await request(app.getHttpServer())
      .post('/kavita/login')
      .send({ username: 'alice', password: 'wrong' })
      .expect(200);
    expect(res.body).toEqual({ data: 'Login Failed', code: 500 });
  });

  it('POST /kavita/login answers 434 when Kavita is not configured', async () => {
    kavita.enabled = false;
    const res = await request(app.getHttpServer())
      .post('/kavita/login')
      .send({ username: 'alice', password: 'x' })
      .expect(200);
    expect(res.body.code).toBe(434);
    expect(kavita.login).not.toHaveBeenCalled();
  });

  it('GET /kavita/status reflects configuration', async () => {
    await request(app.getHttpServer())
      .get('/kavita/status')
      .expect(200, { data: true, code: 200 });
    kavita.enabled = false;
    await request(app.getHttpServer())
      .get('/kavita/status')
      .expect(200, { data: false, code: 404 });
  });
});
