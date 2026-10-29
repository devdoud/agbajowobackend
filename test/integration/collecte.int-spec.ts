import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  corps,
  creerAppDeTest,
  seConnecter,
  type AppDeTest,
  type CorpsErreur,
} from '../support/app';
import { viderBase } from '../support/base';
import { creerAgent, creerContrat, creerMembre } from '../support/fabriques';

const FORMAT_RECU = /^REC-\d{8}-\d{5}$/;

/** Versement tel que renvoyé en JSON (BigInt sérialisés en chaînes). */
interface CorpsVersement {
  id: string;
  contratId: string;
  misesCount: number;
  amount: string;
  numeroMiseDebut: number;
  numeroMiseFin: number;
  receiptNumber: string;
}

describe('POST /api/v1/versements (encaissement)', () => {
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

  /** Un agent connecté, propriétaire d'un contrat actif. */
  async function agentAvecContrat(
    contratOpts: Parameters<typeof creerContrat>[2] = {},
  ) {
    const { agent, motDePasse } = await creerAgent(ctx.prisma);
    const membre = await creerMembre(ctx.prisma, agent.id);
    const contrat = await creerContrat(ctx.prisma, membre, contratOpts);
    const jeton = await seConnecter(ctx.app, agent.telephone, motDePasse);
    return { agent, contrat, jeton };
  }

  function encaisser(jeton: string, body: Record<string, unknown>) {
    return request(http)
      .post('/api/v1/versements')
      .set('Authorization', `Bearer ${jeton}`)
      .send(body);
  }

  it('encaisse des mises : montant, plage de mises et reçu (AC-7)', async () => {
    const { contrat, jeton } = await agentAvecContrat();

    const res1 = await encaisser(jeton, {
      contratId: contrat.id,
      misesCount: 3,
    });
    expect(res1.status).toBe(201);
    const premier = corps<CorpsVersement>(res1);
    expect(premier).toMatchObject({
      contratId: contrat.id,
      misesCount: 3,
      amount: '1500',
      numeroMiseDebut: 1,
      numeroMiseFin: 3,
    });
    expect(premier.receiptNumber).toMatch(FORMAT_RECU);

    const res2 = await encaisser(jeton, {
      contratId: contrat.id,
      misesCount: 2,
    });
    expect(res2.status).toBe(201);
    const second = corps<CorpsVersement>(res2);
    expect(second).toMatchObject({ numeroMiseDebut: 4, numeroMiseFin: 5 });
    expect(second.receiptNumber).not.toBe(premier.receiptNumber);

    const enBase = await ctx.prisma.versement.findUnique({
      where: { id: premier.id },
    });
    expect(enBase?.amount).toBe(1500n);
  });

  it('est idempotent sur le même id (AC-8)', async () => {
    const { contrat, jeton } = await agentAvecContrat();
    const body = { id: randomUUID(), contratId: contrat.id, misesCount: 1 };

    const resA = await encaisser(jeton, body);
    const resB = await encaisser(jeton, body);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    const a = corps<CorpsVersement>(resA);
    const b = corps<CorpsVersement>(resB);
    expect(b.id).toBe(a.id);
    expect(b.receiptNumber).toBe(a.receiptNumber);
    expect(
      await ctx.prisma.versement.count({ where: { contratId: contrat.id } }),
    ).toBe(1);
  });

  it("passe le contrat en TERMINE quand l'objectif est atteint (AC-9)", async () => {
    const { contrat, jeton } = await agentAvecContrat({ targetMises: 5 });

    const res = await encaisser(jeton, {
      contratId: contrat.id,
      misesCount: 5,
    });

    expect(res.status).toBe(201);
    const apres = await ctx.prisma.contrat.findUniqueOrThrow({
      where: { id: contrat.id },
    });
    expect(apres.statut).toBe('TERMINE');
  });

  it("refuse un versement qui dépasse l'objectif, sans rien écrire (AC-9)", async () => {
    const { contrat, jeton } = await agentAvecContrat({ targetMises: 5 });

    const res = await encaisser(jeton, {
      contratId: contrat.id,
      misesCount: 6,
    });

    expect(res.status).toBe(422);
    expect(corps<CorpsErreur>(res).code).toBe('BUSINESS_RULE');
    expect(await ctx.prisma.versement.count()).toBe(0);
  });

  it('refuse un encaissement sur un contrat non actif (AC-9)', async () => {
    const { contrat, jeton } = await agentAvecContrat({ statut: 'SUSPENDU' });

    const res = await encaisser(jeton, {
      contratId: contrat.id,
      misesCount: 1,
    });

    expect(res.status).toBe(422);
    expect(corps<CorpsErreur>(res).code).toBe('BUSINESS_RULE');
  });

  describe("erreurs d'API (AC-10)", () => {
    /** Toute erreur a la forme `{ code, message, requestId }`. */
    function verifierErreur(res: request.Response, code: string) {
      const erreur = corps<CorpsErreur>(res);
      expect(erreur.code).toBe(code);
      expect(typeof erreur.message).toBe('string');
      expect(typeof erreur.requestId).toBe('string');
    }

    it('401 sans jeton', async () => {
      const res = await request(http)
        .post('/api/v1/versements')
        .send({ contratId: randomUUID(), misesCount: 1 });

      expect(res.status).toBe(401);
      verifierErreur(res, 'UNAUTHENTICATED');
    });

    it('400 sur un payload invalide', async () => {
      const { jeton } = await agentAvecContrat();

      const res = await encaisser(jeton, {
        contratId: 'pas-un-uuid',
        misesCount: 0,
      });

      expect(res.status).toBe(400);
      verifierErreur(res, 'VALIDATION_ERROR');
    });

    it("404 sur le contrat d'un autre agent", async () => {
      const { jeton } = await agentAvecContrat();
      const { contrat: contratAutre } = await agentAvecContrat();

      const res = await encaisser(jeton, {
        contratId: contratAutre.id,
        misesCount: 1,
      });

      expect(res.status).toBe(404);
      verifierErreur(res, 'NOT_FOUND');
      expect(await ctx.prisma.versement.count()).toBe(0);
    });
  });
});
