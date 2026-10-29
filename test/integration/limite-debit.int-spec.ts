import request from 'supertest';
import type { App } from 'supertest/types';
import {
  corps,
  creerAppDeTest,
  type AppDeTest,
  type CorpsErreur,
} from '../support/app';
import { viderBase } from '../support/base';
import { creerAgent } from '../support/fabriques';

/**
 * La suite neutralise la limite de débit ; ce test prouve qu'elle existe toujours
 * en prod (10 logins par minute, cf. @Throttle de auth.controller.ts).
 */
describe('Limite de débit du login (AC-6)', () => {
  let ctx: AppDeTest;

  beforeAll(async () => {
    ctx = await creerAppDeTest({ limiteDeDebit: true });
    await viderBase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('renvoie 429 RATE_LIMITED au 11e login dans la minute', async () => {
    const { agent, motDePasse } = await creerAgent(ctx.prisma);
    const http = ctx.app.getHttpServer() as App;
    const login = () =>
      request(http)
        .post('/api/v1/auth/login')
        .send({ telephone: agent.telephone, password: motDePasse });

    for (let i = 1; i <= 10; i += 1) {
      expect((await login()).status).toBe(200);
    }
    const onzieme = await login();

    expect(onzieme.status).toBe(429);
    expect(corps<CorpsErreur>(onzieme).code).toBe('RATE_LIMITED');
  });
});
