import request from 'supertest';
import type { App } from 'supertest/types';
import type { AppDeTest } from '../support/app';
import { viderBase } from '../support/base';
import { creerAgent, MOT_DE_PASSE_TEST } from '../support/fabriques';

/**
 * Derrière le proxy de Render (spec 0004, mise en ligne AC-1) : avec TRUST_PROXY=1,
 * la limite de connexions (10 par minute) vaut par client, pas pour tous les agents.
 */
describe('limite de débit derrière un proxy (TRUST_PROXY=1)', () => {
  let ctx: AppDeTest;
  let http: App;

  beforeAll(async () => {
    // Avant le chargement d'AppModule : la config d'env est lue à l'import.
    process.env.TRUST_PROXY = '1';
    const { creerAppDeTest } = await import('../support/app');
    ctx = await creerAppDeTest({ limiteDeDebit: true });
    http = ctx.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await viderBase(ctx.prisma);
  });

  function login(telephone: string, ip: string) {
    return request(http)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ telephone, password: MOT_DE_PASSE_TEST });
  }

  it('compte la limite par client, et ignore une IP ajoutée à gauche par le client', async () => {
    const { agent } = await creerAgent(ctx.prisma);

    const codes: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      codes.push((await login(agent.telephone, '1.1.1.1')).status);
    }
    const onzieme = await login(agent.telephone, '1.1.1.1');
    const autreClient = await login(agent.telephone, '2.2.2.2');
    const usurpation = await login(agent.telephone, '9.9.9.9, 1.1.1.1');

    expect(codes).toEqual(Array<number>(10).fill(200));
    expect(onzieme.status).toBe(429);
    expect(autreClient.status).toBe(200);
    // Le proxy (1 saut) ajoute la vraie IP à droite : la valeur de gauche est ignorée.
    expect(usurpation.status).toBe(429);
  });
});
