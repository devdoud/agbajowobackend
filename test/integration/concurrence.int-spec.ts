import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  corps,
  creerAppDeTest,
  seConnecter,
  type AppDeTest,
} from '../support/app';
import { viderBase } from '../support/base';
import { creerAgent, creerContrat, creerMembre } from '../support/fabriques';

/** Nombre de requêtes lancées en même temps : plus de deux pour élargir la fenêtre de course. */
const SIMULTANEES = 5;

/**
 * Opérations simultanées sur un même contrat. Chaque test vérifie l'invariant de caisse
 * en base, pas seulement les codes HTTP : ni dépassement de l'objectif, ni double retrait.
 * Contrat GROUPE_1 des fabriques : 10 mises versées = 5000 FCFA brut, 4500 récupérables.
 */
describe('concurrence sur un même contrat', () => {
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

  async function contratAvecMises(
    mises: number,
    contratOpts: Parameters<typeof creerContrat>[2] = {},
  ) {
    const { agent, motDePasse } = await creerAgent(ctx.prisma);
    const membre = await creerMembre(ctx.prisma, agent.id);
    const contrat = await creerContrat(ctx.prisma, membre, contratOpts);
    const jeton = await seConnecter(ctx.app, agent.telephone, motDePasse);
    if (mises > 0) {
      const res = await encaisser(jeton, contrat.id, mises);
      expect(res.status).toBe(201);
    }
    return { contrat, jeton };
  }

  function encaisser(jeton: string, contratId: string, misesCount: number) {
    return request(http)
      .post('/api/v1/versements')
      .set('Authorization', `Bearer ${jeton}`)
      .send({ contratId, misesCount });
  }

  function retirer(jeton: string, body: Record<string, unknown>) {
    return request(http)
      .post('/api/v1/retraits')
      .set('Authorization', `Bearer ${jeton}`)
      .send(body);
  }

  /** Lance `n` fois la même opération en parallèle et renvoie les codes HTTP triés. */
  async function enMemeTemps(
    n: number,
    operation: () => request.Test,
  ): Promise<number[]> {
    const reponses = await Promise.all(
      Array.from({ length: n }, () => operation()),
    );
    return reponses.map((r) => r.status).sort();
  }

  it('des retraits totaux simultanés ne produisent qu’un seul retrait', async () => {
    const { contrat, jeton } = await contratAvecMises(10);

    const codes = await enMemeTemps(SIMULTANEES, () =>
      retirer(jeton, { contratId: contrat.id, type: 'TOTAL' }),
    );

    expect(codes).toEqual([201, ...Array<number>(SIMULTANEES - 1).fill(422)]);
    const totaux = await ctx.prisma.retrait.aggregate({
      where: { contratId: contrat.id },
      _sum: { montantBrut: true, montantNet: true },
      _count: true,
    });
    expect(totaux._count).toBe(1);
    expect(totaux._sum.montantBrut).toBe(5000n);
    expect(totaux._sum.montantNet).toBe(4500n);
  });

  it('des retraits partiels simultanés ne dépassent pas le récupérable', async () => {
    const { contrat, jeton } = await contratAvecMises(10);

    // 3000 net chacun : un seul tient dans les 4500 récupérables.
    const codes = await enMemeTemps(SIMULTANEES, () =>
      retirer(jeton, { contratId: contrat.id, type: 'PARTIEL', montant: 3000 }),
    );

    expect(codes).toEqual([201, ...Array<number>(SIMULTANEES - 1).fill(422)]);
    const totaux = await ctx.prisma.retrait.aggregate({
      where: { contratId: contrat.id },
      _sum: { montantBrut: true, commissionPrelevee: true },
    });
    // La commission n'est prélevée qu'une fois, et on ne retire pas plus que versé.
    expect(totaux._sum.commissionPrelevee).toBe(500n);
    expect(totaux._sum.montantBrut).toBe(3500n);
  });

  it("des encaissements simultanés ne dépassent pas l'objectif", async () => {
    const { contrat, jeton } = await contratAvecMises(0, { targetMises: 5 });

    // 3 mises chacun : un seul tient dans l'objectif de 5.
    const codes = await enMemeTemps(SIMULTANEES, () =>
      encaisser(jeton, contrat.id, 3),
    );

    expect(codes).toEqual([201, ...Array<number>(SIMULTANEES - 1).fill(422)]);
    const totaux = await ctx.prisma.versement.aggregate({
      where: { contratId: contrat.id },
      _sum: { misesCount: true },
    });
    expect(totaux._sum.misesCount).toBe(3);
  });

  describe('avances', () => {
    function avancer(jeton: string, body: Record<string, unknown>) {
      return request(http)
        .post('/api/v1/avances')
        .set('Authorization', `Bearer ${jeton}`)
        .send(body);
    }

    it('des avances simultanées ne dépassent pas maxAvances, avec des rangs distincts', async () => {
      const { contrat, jeton } = await contratAvecMises(10);

      const codes = await enMemeTemps(SIMULTANEES, () =>
        avancer(jeton, { contratId: contrat.id, nbMois: 1, montant: 1000 }),
      );

      // GROUPE_1 : au plus 2 avances par contrat.
      expect(codes).toEqual([
        201,
        201,
        ...Array<number>(SIMULTANEES - 2).fill(422),
      ]);
      const avances = await ctx.prisma.avance.findMany({
        where: { contratId: contrat.id },
        orderBy: { rang: 'asc' },
      });
      expect(avances.map((a) => a.rang)).toEqual([1, 2]);
    });

    it('une avance simultanée à un retrait total ne fait pas payer au membre plus que son récupérable', async () => {
      const { contrat, jeton } = await contratAvecMises(10);

      await Promise.all([
        avancer(jeton, { contratId: contrat.id, nbMois: 1, montant: 1000 }),
        retirer(jeton, { contratId: contrat.id, type: 'TOTAL' }),
        avancer(jeton, { contratId: contrat.id, nbMois: 1, montant: 1000 }),
      ]);

      // Argent remis au membre : avances (principal) + net des retraits.
      // Il ne dépasse jamais les 5000 versés moins les 500 de commission.
      const [avances, retraits] = await Promise.all([
        ctx.prisma.avance.aggregate({
          where: { contratId: contrat.id },
          _sum: { montant: true },
        }),
        ctx.prisma.retrait.aggregate({
          where: { contratId: contrat.id },
          _sum: { montantNet: true },
        }),
      ]);
      const remis =
        (avances._sum.montant ?? 0n) + (retraits._sum.montantNet ?? 0n);
      expect(remis).toBeLessThanOrEqual(4500n);
    });

    it('une avance relancée en parallèle avec le même id renvoie partout l’avance enregistrée', async () => {
      const { contrat, jeton } = await contratAvecMises(10);
      const body = {
        id: randomUUID(),
        contratId: contrat.id,
        nbMois: 1,
        montant: 1000,
      };

      const reponses = await Promise.all(
        Array.from({ length: SIMULTANEES }, () => avancer(jeton, body)),
      );

      expect(reponses.map((r) => r.status)).toEqual(
        Array<number>(SIMULTANEES).fill(201),
      );
      expect(
        await ctx.prisma.avance.count({ where: { contratId: contrat.id } }),
      ).toBe(1);
    });
  });

  describe('relances simultanées avec le même id (idempotence)', () => {
    it('un retrait total relancé en parallèle renvoie partout le retrait enregistré', async () => {
      const { contrat, jeton } = await contratAvecMises(10);
      const body = { id: randomUUID(), contratId: contrat.id, type: 'TOTAL' };

      const reponses = await Promise.all(
        Array.from({ length: SIMULTANEES }, () => retirer(jeton, body)),
      );

      expect(reponses.map((r) => r.status)).toEqual(
        Array<number>(SIMULTANEES).fill(201),
      );
      expect(new Set(reponses.map((r) => corps<{ id: string }>(r).id))).toEqual(
        new Set([body.id]),
      );
      expect(
        await ctx.prisma.retrait.count({ where: { contratId: contrat.id } }),
      ).toBe(1);
    });

    it("le versement qui atteint l'objectif, relancé en parallèle, renvoie partout le versement enregistré", async () => {
      const { contrat, jeton } = await contratAvecMises(0, { targetMises: 3 });
      const body = { id: randomUUID(), contratId: contrat.id, misesCount: 3 };

      const reponses = await Promise.all(
        Array.from({ length: SIMULTANEES }, () =>
          request(http)
            .post('/api/v1/versements')
            .set('Authorization', `Bearer ${jeton}`)
            .send(body),
        ),
      );

      expect(reponses.map((r) => r.status)).toEqual(
        Array<number>(SIMULTANEES).fill(201),
      );
      expect(
        await ctx.prisma.versement.count({ where: { contratId: contrat.id } }),
      ).toBe(1);
    });
  });

  it('un encaissement simultané à un retrait total ne reste pas dans un contrat clos', async () => {
    const { contrat, jeton } = await contratAvecMises(10);

    await Promise.all([
      retirer(jeton, { contratId: contrat.id, type: 'TOTAL' }),
      encaisser(jeton, contrat.id, 3),
      encaisser(jeton, contrat.id, 3),
    ]);

    // Contrat clos : tout ce qui a été versé doit être sorti par le retrait total.
    const apres = await ctx.prisma.contrat.findUniqueOrThrow({
      where: { id: contrat.id },
    });
    expect(apres.statut).toBe('CLOTURE_ANTICIPEE');
    const [verse, retire] = await Promise.all([
      ctx.prisma.versement.aggregate({
        where: { contratId: contrat.id },
        _sum: { amount: true },
      }),
      ctx.prisma.retrait.aggregate({
        where: { contratId: contrat.id },
        _sum: { montantBrut: true },
      }),
    ]);
    expect(retire._sum.montantBrut).toBe(verse._sum.amount);
  });
});
