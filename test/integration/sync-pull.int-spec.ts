import request from 'supertest';
import type { App } from 'supertest/types';
import { creerAppDeTest, seConnecter, type AppDeTest } from '../support/app';
import { viderBase } from '../support/base';
import {
  creerAgent,
  creerAvance,
  creerContrat,
  creerMembre,
  creerRetrait,
  creerVersement,
} from '../support/fabriques';

interface CorpsPull {
  changes: {
    versements: { id: string }[];
    avances: { id: string }[];
    retraits: { id: string }[];
  };
}

/**
 * Pull d'un AGENT : il reçoit les mouvements de ses contrats, même saisis par un
 * superviseur, et jamais ceux des contrats d'un autre agent.
 */
describe('GET /api/v1/sync/pull (portée des mouvements)', () => {
  let ctx: AppDeTest;
  let http: App;

  beforeAll(async () => {
    ctx = await creerAppDeTest();
    http = ctx.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await viderBase(ctx.prisma);
  });

  async function tirer(jeton: string): Promise<CorpsPull> {
    const res = await request(http)
      .get('/api/v1/sync/pull?since=0')
      .set('Authorization', `Bearer ${jeton}`);
    expect(res.status).toBe(200);
    return res.body as CorpsPull;
  }

  it("inclut les mouvements saisis par un superviseur sur les contrats de l'agent", async () => {
    const { agent, motDePasse } = await creerAgent(ctx.prisma);
    const { agent: superviseur } = await creerAgent(ctx.prisma, {
      role: 'SUPERVISEUR',
    });
    const membre = await creerMembre(ctx.prisma, agent.id);
    const contrat = await creerContrat(ctx.prisma, membre);

    const parAgent = await creerVersement(ctx.prisma, contrat, agent.id);
    const parSuperviseur = await creerVersement(
      ctx.prisma,
      contrat,
      superviseur.id,
    );
    const avance = await creerAvance(ctx.prisma, contrat, superviseur.id);
    const retrait = await creerRetrait(ctx.prisma, contrat, superviseur.id);

    const jeton = await seConnecter(ctx.app, agent.telephone, motDePasse);
    const { changes } = await tirer(jeton);

    expect(changes.versements.map((v) => v.id).sort()).toEqual(
      [parAgent.id, parSuperviseur.id].sort(),
    );
    expect(changes.avances.map((a) => a.id)).toEqual([avance.id]);
    expect(changes.retraits.map((r) => r.id)).toEqual([retrait.id]);
  });

  it("n'inclut pas les mouvements des contrats d'un autre agent", async () => {
    const { agent, motDePasse } = await creerAgent(ctx.prisma);
    const { agent: autre } = await creerAgent(ctx.prisma);
    const membreAutre = await creerMembre(ctx.prisma, autre.id);
    const contratAutre = await creerContrat(ctx.prisma, membreAutre);
    await creerVersement(ctx.prisma, contratAutre, autre.id);
    await creerAvance(ctx.prisma, contratAutre, autre.id);
    await creerRetrait(ctx.prisma, contratAutre, autre.id);

    const jeton = await seConnecter(ctx.app, agent.telephone, motDePasse);
    const { changes } = await tirer(jeton);

    expect(changes.versements).toEqual([]);
    expect(changes.avances).toEqual([]);
    expect(changes.retraits).toEqual([]);
  });
});
