import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { RAISONS_DATE_TERRAIN } from '@/domain/date-terrain';
import {
  corps,
  creerAppDeTest,
  seConnecter,
  type AppDeTest,
  type CorpsErreur,
} from '../support/app';
import { viderBase } from '../support/base';
import { creerAgent, creerContrat, creerMembre } from '../support/fabriques';

/** Heure figée du serveur pour toute la suite (spec 0003). */
const HORLOGE = new Date('2026-10-29T12:00:00.000Z');
const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 86_400_000;
const iso = (ms: number) => new Date(HORLOGE.getTime() + ms).toISOString();

interface CorpsMouvement {
  id: string;
  paidAt?: string;
  dateAvance?: string;
  dateRetrait?: string;
}

interface CorpsPush {
  applied: { versements: { id: string }[]; retraits: unknown[] };
  conflicts: { entity: string; id: string; reason: string }[];
}

describe('dates terrain des mouvements (spec 0003)', () => {
  let ctx: AppDeTest;
  let http: App;

  beforeAll(async () => {
    ctx = await creerAppDeTest({ horloge: HORLOGE });
    http = ctx.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await viderBase(ctx.prisma);
  });

  /** Agent connecté avec un contrat commencé le `startDate` donné (1er sept. par défaut). */
  async function contrat(startDate = '2026-09-01') {
    const { agent, motDePasse } = await creerAgent(ctx.prisma);
    const membre = await creerMembre(ctx.prisma, agent.id);
    const c = await creerContrat(ctx.prisma, membre, {
      startDate: new Date(`${startDate}T00:00:00Z`),
    });
    const jeton = await seConnecter(ctx.app, agent.telephone, motDePasse);
    return { contratId: c.id, jeton };
  }

  function poster(jeton: string, chemin: string, body: object) {
    return request(http)
      .post(`/api/v1${chemin}`)
      .set('Authorization', `Bearer ${jeton}`)
      .send(body);
  }

  describe('versement en direct', () => {
    it('garde l’instant exact d’une date en +01:00 (AC-9)', async () => {
      const { contratId, jeton } = await contrat();

      const res = await poster(jeton, '/versements', {
        contratId,
        misesCount: 1,
        paidAt: '2026-10-28T23:30:00+01:00',
      });

      expect(res.status).toBe(201);
      expect(corps<CorpsMouvement>(res).paidAt).toBe(
        '2026-10-28T22:30:00.000Z',
      );
    });

    it("prend l'heure du serveur quand la date est absente (AC-2)", async () => {
      const { contratId, jeton } = await contrat();

      const res = await poster(jeton, '/versements', {
        contratId,
        misesCount: 1,
      });

      expect(res.status).toBe(201);
      expect(corps<CorpsMouvement>(res).paidAt).toBe(HORLOGE.toISOString());
    });

    it.each([
      null,
      1730000000000,
      '2026-10-29',
      '2026-10-29T11:30:00',
      '2026-10-29T24:00:00Z',
      '2026-10-29T10:00:00+99:00',
      '2026-10-29T11:30:00z',
      '2026-10-29T11:30:00-00:00',
    ])('refuse paidAt %p en 400, sans rien écrire (AC-1)', async (paidAt) => {
      const { contratId, jeton } = await contrat();

      const res = await poster(jeton, '/versements', {
        contratId,
        misesCount: 1,
        paidAt,
      });

      expect(res.status).toBe(400);
      expect(corps<CorpsErreur>(res).code).toBe('VALIDATION_ERROR');
      expect(await ctx.prisma.versement.count()).toBe(0);
    });

    it.each([
      [iso(15 * MINUTE), 201, null],
      [iso(15 * MINUTE + 1), 422, RAISONS_DATE_TERRAIN.futur],
      [iso(-30 * JOUR), 201, null],
      [iso(-30 * JOUR - 1), 422, RAISONS_DATE_TERRAIN.ancienne],
    ])('borne %s : %d (AC-3, AC-4, AC-11)', async (paidAt, statut, message) => {
      const { contratId, jeton } = await contrat();

      const res = await poster(jeton, '/versements', {
        contratId,
        misesCount: 1,
        paidAt,
      });

      expect(res.status).toBe(statut);
      if (message) {
        expect(corps<CorpsErreur>(res)).toMatchObject({
          code: 'BUSINESS_RULE',
          message,
        });
      }
    });

    it('refuse un jour du Bénin avant le début du contrat (AC-5, AC-11)', async () => {
      const { contratId, jeton } = await contrat('2026-10-20');

      const avant = await poster(jeton, '/versements', {
        contratId,
        misesCount: 1,
        paidAt: '2026-10-19T22:59:59Z',
      });
      const minuitBenin = await poster(jeton, '/versements', {
        contratId,
        misesCount: 1,
        paidAt: '2026-10-19T23:00:00Z',
      });

      expect(avant.status).toBe(422);
      expect(corps<CorpsErreur>(avant).message).toBe(
        'Date terrain avant le début du contrat (2026-10-20).',
      );
      expect(minuitBenin.status).toBe(201);
    });

    it('refuse aussi la date par défaut sur un contrat qui commence demain (AC-5)', async () => {
      const { contratId, jeton } = await contrat('2026-10-30');

      const res = await poster(jeton, '/versements', {
        contratId,
        misesCount: 1,
      });

      expect(res.status).toBe(422);
    });

    it('rejoue un versement existant sans contrôler ses bornes (AC-8)', async () => {
      const { contratId, jeton } = await contrat();
      const id = randomUUID();
      const premier = await poster(jeton, '/versements', {
        id,
        contratId,
        misesCount: 1,
        paidAt: iso(-JOUR),
      });

      const rejeu = await poster(jeton, '/versements', {
        id,
        contratId,
        misesCount: 1,
        paidAt: '2020-01-01T00:00:00Z',
      });

      expect(premier.status).toBe(201);
      expect(rejeu.status).toBe(201);
      expect(corps<CorpsMouvement>(rejeu)).toMatchObject({
        id,
        paidAt: iso(-JOUR),
      });
    });
  });

  describe('avance et retrait en direct', () => {
    it('contrôlent format et bornes de dateAvance (AC-1, AC-3)', async () => {
      const { contratId, jeton } = await contrat();
      const body = { contratId, nbMois: 1, montant: 1000 };

      const nul = await poster(jeton, '/avances', {
        ...body,
        dateAvance: null,
      });
      const futur = await poster(jeton, '/avances', {
        ...body,
        dateAvance: iso(HEURE),
      });
      const ok = await poster(jeton, '/avances', {
        ...body,
        dateAvance: iso(-MINUTE),
      });

      expect(nul.status).toBe(400);
      expect(futur.status).toBe(422);
      expect(corps<CorpsErreur>(futur).message).toBe(
        RAISONS_DATE_TERRAIN.futur,
      );
      expect(ok.status).toBe(201);
      expect(corps<CorpsMouvement>(ok).dateAvance).toBe(iso(-MINUTE));
    });

    it('contrôlent format et bornes de dateRetrait (AC-1, AC-4)', async () => {
      const { contratId, jeton } = await contrat();
      await poster(jeton, '/versements', { contratId, misesCount: 10 });
      const body = { contratId, type: 'PARTIEL', montant: 500 };

      const sansFuseau = await poster(jeton, '/retraits', {
        ...body,
        dateRetrait: '2026-10-29T10:00:00',
      });
      const ancien = await poster(jeton, '/retraits', {
        ...body,
        dateRetrait: iso(-31 * JOUR),
      });
      const ok = await poster(jeton, '/retraits', {
        ...body,
        dateRetrait: iso(-HEURE),
      });

      expect(sansFuseau.status).toBe(400);
      expect(ancien.status).toBe(422);
      expect(corps<CorpsErreur>(ancien).message).toBe(
        RAISONS_DATE_TERRAIN.ancienne,
      );
      expect(ok.status).toBe(201);
      expect(corps<CorpsMouvement>(ok).dateRetrait).toBe(iso(-HEURE));
    });
  });

  describe('synchro (push)', () => {
    it('applique le mouvement valide et renvoie un conflit par date fautive, en 200 (AC-6, AC-7, AC-11)', async () => {
      const { contratId, jeton } = await contrat();
      await poster(jeton, '/versements', { contratId, misesCount: 10 });
      const [valide, nul, sansDate, futur] = [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ];

      const res = await poster(jeton, '/sync/push', {
        versements: [
          { id: valide, contratId, misesCount: 1, paidAt: iso(-HEURE) },
          { id: nul, contratId, misesCount: 1, paidAt: null },
        ],
        avances: [
          {
            id: futur,
            contratId,
            nbMois: 1,
            montant: 1000,
            dateAvance: iso(JOUR),
          },
        ],
        retraits: [{ id: sansDate, contratId, type: 'PARTIEL', montant: 500 }],
      });

      expect(res.status).toBe(200);
      const push = corps<CorpsPush>(res);
      expect(push.applied.versements.map((v) => v.id)).toEqual([valide]);
      expect(push.conflicts).toEqual([
        { entity: 'versement', id: nul, reason: RAISONS_DATE_TERRAIN.invalide },
        { entity: 'avance', id: futur, reason: RAISONS_DATE_TERRAIN.futur },
        {
          entity: 'retrait',
          id: sansDate,
          reason: RAISONS_DATE_TERRAIN.manquante,
        },
      ]);
      expect(await ctx.prisma.retrait.count()).toBe(0);
      expect(await ctx.prisma.avance.count()).toBe(0);
    });

    it('rejoue un mouvement déjà enregistré même renvoyé sans date (AC-8)', async () => {
      const { contratId, jeton } = await contrat();
      const id = randomUUID();
      const lot = (paidAt?: string) => ({
        versements: [{ id, contratId, misesCount: 1, paidAt }],
      });

      const premier = await poster(jeton, '/sync/push', lot(iso(-HEURE)));
      const rejeu = await poster(jeton, '/sync/push', lot(undefined));

      expect(corps<CorpsPush>(premier).applied.versements).toHaveLength(1);
      const rejoue = corps<CorpsPush>(rejeu);
      expect(rejoue.conflicts).toEqual([]);
      expect(rejoue.applied.versements.map((v) => v.id)).toEqual([id]);
      expect(await ctx.prisma.versement.count()).toBe(1);
    });

    it('enregistre les mouvements poussés à l’instant envoyé, fuseau compris (AC-6, AC-9)', async () => {
      const { contratId, jeton } = await contrat();
      await poster(jeton, '/versements', { contratId, misesCount: 10 });
      const [v, a, r] = [randomUUID(), randomUUID(), randomUUID()];

      const res = await poster(jeton, '/sync/push', {
        versements: [
          {
            id: v,
            contratId,
            misesCount: 1,
            paidAt: '2026-10-28T23:30:00+01:00',
          },
        ],
        avances: [
          {
            id: a,
            contratId,
            nbMois: 1,
            montant: 1000,
            dateAvance: iso(-2 * HEURE),
          },
        ],
        retraits: [
          {
            id: r,
            contratId,
            type: 'PARTIEL',
            montant: 500,
            dateRetrait: iso(-HEURE),
          },
        ],
      });

      expect(corps<CorpsPush>(res).conflicts).toEqual([]);
      const [versement, avance, retrait] = await Promise.all([
        ctx.prisma.versement.findUniqueOrThrow({ where: { id: v } }),
        ctx.prisma.avance.findUniqueOrThrow({ where: { id: a } }),
        ctx.prisma.retrait.findUniqueOrThrow({ where: { id: r } }),
      ]);
      expect(versement.paidAt.toISOString()).toBe('2026-10-28T22:30:00.000Z');
      expect(avance.dateAvance.toISOString()).toBe(iso(-2 * HEURE));
      expect(retrait.dateRetrait.toISOString()).toBe(iso(-HEURE));
    });

    it('rejoue aussi une avance et un retrait renvoyés sans date (AC-8)', async () => {
      const { contratId, jeton } = await contrat();
      await poster(jeton, '/versements', { contratId, misesCount: 10 });
      const [a, r] = [randomUUID(), randomUUID()];
      const lot = (avecDates: boolean) => ({
        avances: [
          {
            id: a,
            contratId,
            nbMois: 1,
            montant: 1000,
            ...(avecDates ? { dateAvance: iso(-HEURE) } : {}),
          },
        ],
        retraits: [
          {
            id: r,
            contratId,
            type: 'PARTIEL',
            montant: 500,
            ...(avecDates ? { dateRetrait: iso(-HEURE) } : {}),
          },
        ],
      });

      const premier = await poster(jeton, '/sync/push', lot(true));
      const rejeu = await poster(jeton, '/sync/push', lot(false));

      expect(corps<CorpsPush>(premier).conflicts).toEqual([]);
      expect(corps<CorpsPush>(rejeu).conflicts).toEqual([]);
      expect(await ctx.prisma.avance.count()).toBe(1);
      expect(await ctx.prisma.retrait.count()).toBe(1);
    });

    it('refuse en conflit une date valide mais hors bornes, avec le message du service (AC-6, AC-11)', async () => {
      const { contratId, jeton } = await contrat('2026-10-20');
      const id = randomUUID();

      const res = await poster(jeton, '/sync/push', {
        versements: [
          { id, contratId, misesCount: 1, paidAt: '2026-10-19T12:00:00Z' },
        ],
      });

      expect(res.status).toBe(200);
      expect(corps<CorpsPush>(res).conflicts).toEqual([
        {
          entity: 'versement',
          id,
          reason: 'Date terrain avant le début du contrat (2026-10-20).',
        },
      ]);
      expect(await ctx.prisma.versement.count()).toBe(0);
    });
  });
});
