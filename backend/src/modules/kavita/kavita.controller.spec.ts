import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { createValidationPipe } from '../../common/pipes/validation.pipe';
import { KavitaController } from './kavita.controller';
import { KavitaService } from './kavita.service';

function axiosError(status?: number): Error {
  return Object.assign(new Error(status ? `Request failed with status code ${status}` : 'ECONNREFUSED'), {
    response: status ? { status } : undefined,
  });
}

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
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    kavita.enabled = true;
    kavita.login.mockReset();
    kavita.refreshToken.mockReset();
  });

  const http = () => request(app.getHttpServer());

  it('POST /kavita/login forwards username and password to the service', async () => {
    kavita.login.mockResolvedValue({ apiKey: 'k', jwt: 'j', refreshToken: 'r', loginUrl: 'u' });

    const res = await http()
      .post('/api/kavita/login')
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

    await http()
      .post('/api/kavita/refreshtoken')
      .send({ jwt: 'j1', refreshToken: 'r1' })
      .expect(200, { code: 200, data: { jwt: 'j2', refreshToken: 'r2' } });

    expect(kavita.refreshToken).toHaveBeenCalledWith('j1', 'r1');
  });

  it('rejected credentials → 403 kavita-login-failed (never 401)', async () => {
    kavita.login.mockRejectedValue(axiosError(401));
    const res = await http()
      .post('/api/kavita/login')
      .send({ username: 'alice', password: 'wrong' })
      .expect(403);
    expect(res.body).toMatchObject({ code: 403, error: 'kavita-login-failed' });
  });

  it('unreachable Kavita → 502 kavita-unreachable', async () => {
    kavita.login.mockRejectedValue(axiosError());
    const res = await http()
      .post('/api/kavita/login')
      .send({ username: 'alice', password: 'x' })
      .expect(502);
    expect(res.body.error).toBe('kavita-unreachable');

    kavita.refreshToken.mockRejectedValue(axiosError(500));
    const r2 = await http().post('/api/kavita/refreshtoken').send({ jwt: 'j', refreshToken: 'r' }).expect(502);
    expect(r2.body.error).toBe('kavita-unreachable');
  });

  it('rejected refresh → 403 kavita-refresh-failed', async () => {
    kavita.refreshToken.mockRejectedValue(axiosError(400));
    const res = await http().post('/api/kavita/refreshtoken').send({ jwt: 'j', refreshToken: 'r' }).expect(403);
    expect(res.body.error).toBe('kavita-refresh-failed');
  });

  it('not configured → 404 kavita-disabled', async () => {
    kavita.enabled = false;
    const res = await http()
      .post('/api/kavita/login')
      .send({ username: 'alice', password: 'x' })
      .expect(404);
    expect(res.body).toMatchObject({ code: 404, error: 'kavita-disabled' });
    expect(kavita.login).not.toHaveBeenCalled();
  });

  it('missing fields → 400 validation-failed', async () => {
    const res = await http().post('/api/kavita/login').send({ username: 'a' }).expect(400);
    expect(res.body.error).toBe('validation-failed');
  });

  it('GET /kavita/status keeps its legacy body (HTTP 200, code 200/404)', async () => {
    await http().get('/api/kavita/status').expect(200, { data: true, code: 200 });
    kavita.enabled = false;
    await http().get('/api/kavita/status').expect(200, { data: false, code: 404 });
  });
});
