import {
  Controller,
  Get,
  NotFoundException,
  type INestApplication,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configurerApp } from './app.setup';

const ORIGINE_AUTORISEE = 'http://front.exemple.test';

@Controller('essai')
class EssaiController {
  @Get('montant')
  montant() {
    return { montant: 1500n, serverSeq: 9007199254740993n };
  }

  @Get('introuvable')
  introuvable() {
    throw new NotFoundException('Ressource absente');
  }
}

/**
 * configurerApp est partagée par la prod (main.ts) et les tests d'intégration :
 * ces tests montent une mini app réelle (sans base) et vérifient par HTTP ce
 * qu'elle promet. covers: AC-4 (spec 0001)
 */
describe('configurerApp', () => {
  let app: INestApplication;
  let http: App;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ CORS_ORIGIN: ORIGINE_AUTORISEE })],
        }),
      ],
      controllers: [EssaiController],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    configurerApp(app);
    await app.init();
    http = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sert les routes sous le préfixe api/v1', async () => {
    const res = await request(http).get('/api/v1/essai/montant');

    expect(res.status).toBe(200);
  });

  it('ne sert plus les routes en dehors du préfixe (404 normalisé)', async () => {
    const res = await request(http).get('/essai/montant');

    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe('NOT_FOUND');
  });

  it('sérialise les BigInt en chaînes, sans perte de précision', async () => {
    const res = await request(http).get('/api/v1/essai/montant');

    expect(res.body).toEqual({
      montant: '1500',
      serverSeq: '9007199254740993',
    });
  });

  it('pose un X-Request-Id généré, ou réutilise celui du client', async () => {
    const genere = await request(http).get('/api/v1/essai/montant');
    const repris = await request(http)
      .get('/api/v1/essai/montant')
      .set('X-Request-Id', 'req-123');

    expect(genere.headers['x-request-id']).toEqual(expect.any(String));
    expect(genere.headers['x-request-id']).not.toBe('');
    expect(repris.headers['x-request-id']).toBe('req-123');
  });

  it('applique les en-têtes de sécurité helmet', async () => {
    const res = await request(http).get('/api/v1/essai/montant');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('normalise les erreurs en { code, message, requestId }', async () => {
    const res = await request(http)
      .get('/api/v1/essai/introuvable')
      .set('X-Request-Id', 'req-erreur');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Ressource absente',
      requestId: 'req-erreur',
    });
  });

  it("autorise en CORS l'origine configurée, avec les cookies", async () => {
    const res = await request(http)
      .options('/api/v1/essai/montant')
      .set('Origin', ORIGINE_AUTORISEE)
      .set('Access-Control-Request-Method', 'GET');

    expect(res.headers['access-control-allow-origin']).toBe(ORIGINE_AUTORISEE);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it("n'autorise pas une autre origine en CORS", async () => {
    const res = await request(http)
      .get('/api/v1/essai/montant')
      .set('Origin', 'http://malveillant.exemple.test');

    expect(res.headers['access-control-allow-origin']).not.toBe(
      'http://malveillant.exemple.test',
    );
  });
});
