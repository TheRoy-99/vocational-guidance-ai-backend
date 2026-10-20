import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import {
  THROTTLE_ERROR_MESSAGE,
  createRequestTracker,
  perMinute,
  throttlerOptionsFactory,
} from './throttle.config';

const SECRET = 'secreto-de-prueba';
const sign = (sub: string, secret = SECRET) =>
  new JwtService({ secret }).sign({ sub });

describe('createRequestTracker', () => {
  const tracker = createRequestTracker(SECRET);

  it('identifica al usuario por el id de un token válido', () => {
    const req = {
      headers: { authorization: `Bearer ${sign('user-1')}` },
      body: { email: 'otro@correo.com' },
      ip: '10.0.0.1',
    };
    expect(tracker(req)).toBe('user:user-1');
  });

  it('ignora un token firmado con otra clave (no se puede gastar el cupo ajeno)', () => {
    const req = {
      headers: { authorization: `Bearer ${sign('victima', 'otra-clave')}` },
      body: {},
      ip: '10.0.0.1',
    };
    expect(tracker(req)).toBe('ip:10.0.0.1');
  });

  it('en login y registro cuenta por correo, sin distinguir mayúsculas', () => {
    const req = {
      headers: {},
      body: { email: '  Ana@Correo.com ' },
      ip: '10.0.0.1',
    };
    expect(tracker(req)).toBe('email:ana@correo.com');
  });

  it('sin token ni correo, cuenta por IP', () => {
    expect(tracker({ headers: {}, body: {}, ip: '10.0.0.2' })).toBe(
      'ip:10.0.0.2',
    );
  });
});

@Controller()
class TestController {
  @Post('login')
  @Throttle(perMinute(2))
  login(@Body() body: { email: string }) {
    return { ok: body.email };
  }
}

describe('límite de peticiones (integración)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRootAsync({
          useFactory: () =>
            throttlerOptionsFactory({
              getOrThrow: () => SECRET,
            } as unknown as ConfigService),
        }),
      ],
      controllers: [TestController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('responde 429 en español al superar el límite, y por correo de forma independiente', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const login = (email: string) =>
      request(server).post('/login').send({ email });

    await login('ana@correo.com').expect(201);
    await login('ana@correo.com').expect(201);
    const blocked = await login('ana@correo.com').expect(429);
    expect(JSON.stringify(blocked.body)).toContain(THROTTLE_ERROR_MESSAGE);

    // Otro estudiante (aunque comparta la IP) no queda bloqueado.
    await login('luis@correo.com').expect(201);
  });
});
