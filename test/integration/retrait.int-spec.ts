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
import {
  creerAgent,
  creerAvance,
  creerContrat,
  creerMembre,
} from '../support/fabriques';

const FORMAT_RECU = /^REC-\d{8}-\d{5}$/;

/** Retrait tel que renvoyé en JSON (BigInt sérialisés en chaînes). */
interface CorpsRetrait {
  id: string;
  contratId: string;
  type: 'PARTIEL' | 'TOTAL';
  montantBrut: string;
  commissionPrelevee: string;
  interetDu: string;
  montantNet: string;
  receiptNumber: string;
}

/**
 * Contrat GROUPE_1 des fabriques : mise de 500 FCFA, 31 mises par mois, une mise de
 * commission par mois entamé. 10 mises versées = 5000 FCFA brut, 500 de commission,
 * donc 4500 FCFA récupérables.
 */
describe('POST /api/v1/retraits (retrait)', () => {
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

  /** Un agent connecté, propriétaire d'un contrat actif sur lequel `mises` sont versées. */
  async function contratAvecMises(
    mises: number,
    contratOpts: Parameters<typeof creerContrat>[2] = {},
  ) {
    const { agent, motDePasse } = await creerAgent(ctx.prisma);
    const membre = await creerMembre(ctx.prisma, agent.id);
    const contrat = await creerContrat(ctx.prisma, membre, contratOpts);
    const jeton = await seConnecter(ctx.app, agent.telephone, motDePasse);
    if (mises > 0) {
      const res = await request(http)
        .post('/api/v1/versements')
        .set('Authorization', `Bearer ${jeton}`)
        .send({ contratId: contrat.id, misesCount: mises });
      expect(res.status).toBe(201);
    }
    return { contrat, jeton };
  }

  function retirer(jeton: string, body: Record<string, unknown>) {
    return request(http)
      .post('/api/v1/retraits')
      .set('Authorization', `Bearer ${jeton}`)
      .send(body);
  }

  it('retrait total : verse le net, prélève la commission et clôt le contrat', async () => {
    const { contrat, jeton } = await contratAvecMises(10);

    const res = await retirer(jeton, { contratId: contrat.id, type: 'TOTAL' });

    expect(res.status).toBe(201);
    const retrait = corps<CorpsRetrait>(res);
    expect(retrait).toMatchObject({
      contratId: contrat.id,
      type: 'TOTAL',
      montantBrut: '5000',
      commissionPrelevee: '500',
      interetDu: '0',
      montantNet: '4500',
    });
    expect(retrait.receiptNumber).toMatch(FORMAT_RECU);
    const apres = await ctx.prisma.contrat.findUniqueOrThrow({
      where: { id: contrat.id },
    });
    expect(apres.statut).toBe('CLOTURE_ANTICIPEE');
  });

  it('retrait partiel : prélève la commission en priorité, une seule fois', async () => {
    const { contrat, jeton } = await contratAvecMises(10);

    const res1 = await retirer(jeton, {
      contratId: contrat.id,
      type: 'PARTIEL',
      montant: 1000,
    });
    expect(res1.status).toBe(201);
    expect(corps<CorpsRetrait>(res1)).toMatchObject({
      montantNet: '1000',
      commissionPrelevee: '500',
      montantBrut: '1500',
    });

    const res2 = await retirer(jeton, {
      contratId: contrat.id,
      type: 'PARTIEL',
      montant: 1000,
    });
    expect(res2.status).toBe(201);
    expect(corps<CorpsRetrait>(res2)).toMatchObject({
      montantNet: '1000',
      commissionPrelevee: '0',
      montantBrut: '1000',
    });

    const apres = await ctx.prisma.contrat.findUniqueOrThrow({
      where: { id: contrat.id },
    });
    expect(apres.statut).toBe('ACTIF');
  });

  it('le total après un partiel ne rend que le reste', async () => {
    const { contrat, jeton } = await contratAvecMises(10);
    await retirer(jeton, {
      contratId: contrat.id,
      type: 'PARTIEL',
      montant: 1000,
    });

    const res = await retirer(jeton, { contratId: contrat.id, type: 'TOTAL' });

    expect(res.status).toBe(201);
    expect(corps<CorpsRetrait>(res)).toMatchObject({
      montantBrut: '3500',
      commissionPrelevee: '0',
      montantNet: '3500',
    });
    const totaux = await ctx.prisma.retrait.aggregate({
      where: { contratId: contrat.id },
      _sum: { montantBrut: true, montantNet: true },
    });
    expect(totaux._sum.montantBrut).toBe(5000n);
    expect(totaux._sum.montantNet).toBe(4500n);
  });

  it('le soldeNet du contrat suit les retraits : récupérable restant, puis 0 après le total', async () => {
    // 5000 brut, 500 de commission, avance de 1000 à 250 d'intérêt : 3250 récupérables.
    const { contrat, jeton } = await contratAvecMises(10);
    await creerAvance(ctx.prisma, contrat, contrat.ownerId, {
      montant: 1000n,
      interet: 250n,
    });
    const soldeNet = async () => {
      const res = await request(http)
        .get(`/api/v1/contrats/${contrat.id}`)
        .set('Authorization', `Bearer ${jeton}`);
      expect(res.status).toBe(200);
      return corps<{ derive: { soldeNet: number } }>(res).derive.soldeNet;
    };

    expect(await soldeNet()).toBe(3250);

    // Partiel de 1000 : commission et intérêt prélevés une fois (1750 brut).
    await retirer(jeton, {
      contratId: contrat.id,
      type: 'PARTIEL',
      montant: 1000,
    }).expect(201);
    expect(await soldeNet()).toBe(2250);

    const total = await retirer(jeton, {
      contratId: contrat.id,
      type: 'TOTAL',
    });
    expect(corps<CorpsRetrait>(total).montantNet).toBe('2250');
    expect(await soldeNet()).toBe(0);
  });

  it('refuse un partiel supérieur au récupérable, sans rien écrire', async () => {
    const { contrat, jeton } = await contratAvecMises(10);

    const res = await retirer(jeton, {
      contratId: contrat.id,
      type: 'PARTIEL',
      montant: 4501,
    });

    expect(res.status).toBe(422);
    expect(corps<CorpsErreur>(res).code).toBe('BUSINESS_RULE');
    expect(await ctx.prisma.retrait.count()).toBe(0);
  });

  it("refuse tout partiel tant que la commission n'est pas couverte", async () => {
    // 1 mise = 500 FCFA, entièrement dus en commission : rien de récupérable.
    const { contrat, jeton } = await contratAvecMises(1);

    const res = await retirer(jeton, {
      contratId: contrat.id,
      type: 'PARTIEL',
      montant: 1,
    });

    expect(res.status).toBe(422);
    expect(corps<CorpsErreur>(res).code).toBe('BUSINESS_RULE');
  });

  it('un total sans récupérable rend 0 et garde la commission', async () => {
    const { contrat, jeton } = await contratAvecMises(1);

    const res = await retirer(jeton, { contratId: contrat.id, type: 'TOTAL' });

    expect(res.status).toBe(201);
    expect(corps<CorpsRetrait>(res)).toMatchObject({
      montantBrut: '500',
      commissionPrelevee: '500',
      montantNet: '0',
    });
  });

  it('refuse un retrait sur un contrat non actif', async () => {
    const { contrat, jeton } = await contratAvecMises(0, {
      statut: 'SUSPENDU',
    });

    const res = await retirer(jeton, { contratId: contrat.id, type: 'TOTAL' });

    expect(res.status).toBe(422);
    expect(corps<CorpsErreur>(res).code).toBe('BUSINESS_RULE');
    expect(await ctx.prisma.retrait.count()).toBe(0);
  });

  it('est idempotent sur le même id', async () => {
    const { contrat, jeton } = await contratAvecMises(10);
    const body = {
      id: randomUUID(),
      contratId: contrat.id,
      type: 'PARTIEL',
      montant: 1000,
    };

    const resA = await retirer(jeton, body);
    const resB = await retirer(jeton, body);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    const a = corps<CorpsRetrait>(resA);
    const b = corps<CorpsRetrait>(resB);
    expect(b.id).toBe(a.id);
    expect(b.receiptNumber).toBe(a.receiptNumber);
    expect(
      await ctx.prisma.retrait.count({ where: { contratId: contrat.id } }),
    ).toBe(1);
  });

  it("404 sur le contrat d'un autre agent", async () => {
    const { jeton } = await contratAvecMises(0);
    const { contrat: contratAutre } = await contratAvecMises(10);

    const res = await retirer(jeton, {
      contratId: contratAutre.id,
      type: 'TOTAL',
    });

    expect(res.status).toBe(404);
    expect(corps<CorpsErreur>(res).code).toBe('NOT_FOUND');
    expect(await ctx.prisma.retrait.count()).toBe(0);
  });
});
