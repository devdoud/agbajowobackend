import request from 'supertest';
import type { App } from 'supertest/types';
import { creerAppDeTest, type AppDeTest } from '../support/app';

/** Sans SWAGGER_ENABLED (le défaut, prod comprise), la carte de l'API n'est pas servie. */
describe('documentation Swagger désactivée par défaut', () => {
  let ctx: AppDeTest;
  let http: App;

  beforeAll(async () => {
    ctx = await creerAppDeTest();
    http = ctx.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('ne sert ni l’interface ni le document', async () => {
    const [docs, json] = await Promise.all([
      request(http).get('/api/v1/docs'),
      request(http).get('/api/v1/docs-json'),
    ]);

    // Routes protégées par défaut : sans jeton, un chemin inconnu donne 401 ou 404.
    expect([401, 404]).toContain(docs.status);
    expect([401, 404]).toContain(json.status);
    expect(json.text).not.toContain('openapi');
  });
});
