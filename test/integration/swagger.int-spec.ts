import request from 'supertest';
import type { App } from 'supertest/types';
import type { AppDeTest } from '../support/app';

interface Operation {
  summary?: string;
  security?: Record<string, string[]>[];
  responses: Record<string, unknown>;
}

interface Document {
  openapi: string;
  info: { title: string };
  paths: Record<string, Record<string, Operation>>;
  components: { securitySchemes: Record<string, unknown> };
}

/** Routes publiques (`@Public()`), les seules sans authentification Bearer. */
const PUBLIQUES = [
  'get /api/v1',
  'get /api/v1/health',
  'post /api/v1/auth/login',
  'post /api/v1/auth/refresh',
];

describe('documentation Swagger (SWAGGER_ENABLED=true)', () => {
  let ctx: AppDeTest;
  let http: App;
  let doc: Document;

  beforeAll(async () => {
    // Avant le chargement d'AppModule : la config d'env est lue à l'import.
    process.env.SWAGGER_ENABLED = 'true';
    const { creerAppDeTest } = await import('../support/app');
    ctx = await creerAppDeTest();
    http = ctx.app.getHttpServer() as App;
    const res = await request(http).get('/api/v1/docs-json');
    expect(res.status).toBe(200);
    doc = res.body as Document;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  function operations() {
    return Object.entries(doc.paths).flatMap(([chemin, methodes]) =>
      Object.entries(methodes).map(([methode, op]) => ({
        cle: `${methode} ${chemin}`,
        op,
      })),
    );
  }

  it('sert l’interface sur /api/v1/docs', async () => {
    const res = await request(http).get('/api/v1/docs');

    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });

  it('décrit les 30 routes de l’API, chacune avec un résumé', () => {
    const ops = operations();

    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe('API Agbajowo');
    expect(ops).toHaveLength(30);
    expect(ops.filter((o) => !o.op.summary).map((o) => o.cle)).toEqual([]);
  });

  it('demande le jeton Bearer partout, sauf sur les routes publiques', () => {
    expect(doc.components.securitySchemes).toHaveProperty('bearer');
    const sansJeton = operations()
      .filter((o) => !o.op.security?.some((s) => 'bearer' in s))
      .map((o) => o.cle)
      .sort();

    expect(sansJeton).toEqual([...PUBLIQUES].sort());
  });

  it('documente les erreurs et un exemple sur les routes d’argent', () => {
    const versement = doc.paths['/api/v1/versements'].post;
    const rapport = doc.paths['/api/v1/caisse/agents/{agentId}'].get;

    expect(Object.keys(versement.responses).sort()).toEqual([
      '201',
      '400',
      '401',
      '404',
      '422',
    ]);
    expect(JSON.stringify(rapport.responses['200'])).toContain(
      'receptionsTardives',
    );
  });
});
