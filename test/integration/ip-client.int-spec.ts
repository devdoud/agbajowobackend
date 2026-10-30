import request from 'supertest';
import type { App } from 'supertest/types';
import type { AppDeTest } from '../support/app';
import { viderBase } from '../support/base';
import { creerAgent, MOT_DE_PASSE_TEST } from '../support/fabriques';

/**
 * Sur Render, Cloudflare est devant le proxy de Render : `req.ip` y est l'IP d'un
 * serveur Cloudflare. Avec CLIENT_IP_HEADER=true-client-ip, la limite de connexions
 * (10 par minute) vaut par client d'après cet en-tête (spec 0004, mise en ligne AC-1).
 */
describe('limite de débit par en-tête True-Client-IP (CLIENT_IP_HEADER)', () => {
  let ctx: AppDeTest;
  let http: App;

  beforeAll(async () => {
    // Avant le chargement d'AppModule : la config d'env est lue à l'import.
    process.env.TRUST_PROXY = '1';
    process.env.CLIENT_IP_HEADER = 'true-client-ip';
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

  // Chaque requête arrive par un serveur Cloudflare différent (X-Forwarded-For).
  function login(telephone: string, ipClient: string, ipCloudflare: string) {
    return request(http)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ipCloudflare)
      .set('True-Client-IP', ipClient)
      .send({ telephone, password: MOT_DE_PASSE_TEST });
  }

  it('compte la limite par client même quand le serveur relais change', async () => {
    const { agent } = await creerAgent(ctx.prisma);

    const codes: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      codes.push(
        (await login(agent.telephone, '41.85.1.2', `172.68.0.${i}`)).status,
      );
    }
    const onzieme = await login(agent.telephone, '41.85.1.2', '172.68.0.99');
    // Un autre client passé par le même serveur Cloudflare garde sa propre limite.
    const autreClient = await login(agent.telephone, '41.85.3.4', '172.68.0.0');

    expect(codes).toEqual(Array<number>(10).fill(200));
    expect(onzieme.status).toBe(429);
    expect(autreClient.status).toBe(200);
  });
});
