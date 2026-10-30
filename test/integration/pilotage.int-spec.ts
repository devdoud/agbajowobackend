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
import {
  creerAgent,
  creerAvance,
  creerContrat,
  creerMembre,
  creerRetrait,
  creerVersement,
} from '../support/fabriques';

/** Midi au Bénin le 30 octobre 2026. */
const HORLOGE = new Date('2026-10-30T11:00:00.000Z');
const MINUTE = 60_000;

interface LigneAgent {
  id: string;
  derniereSyncA: string | null;
}

/**
 * Pilotage terrain (spec 0005) : dernière synchro par agent, horloge des téléphones,
 * doublons de téléphone entre agents, courbe par jour.
 */
describe('pilotage terrain (spec 0005)', () => {
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

  async function connecter(role: 'AGENT' | 'SUPERVISEUR' = 'AGENT') {
    const { agent, motDePasse } = await creerAgent(ctx.prisma, { role });
    const jeton = await seConnecter(ctx.app, agent.telephone, motDePasse);
    return { agent, jeton };
  }

  /** Contrat actif d'un agent, commencé le 1er octobre. */
  async function contratDe(ownerId: string) {
    const membre = await creerMembre(ctx.prisma, ownerId);
    return creerContrat(ctx.prisma, membre, {
      startDate: new Date('2026-10-01T00:00:00Z'),
    });
  }

  const get = (jeton: string, url: string) =>
    request(http).get(url).set('Authorization', `Bearer ${jeton}`);

  describe('dernière synchro (GET /agents)', () => {
    it('AC-1 : vaut null avant toute synchro, puis l’heure du dernier pull ou push', async () => {
      const agent = await connecter();
      const { jeton: superviseur } = await connecter('SUPERVISEUR');

      const avant = await get(superviseur, '/api/v1/agents');
      const ligne = (res: Parameters<typeof corps>[0]) =>
        corps<LigneAgent[]>(res).find((a) => a.id === agent.agent.id);
      expect(ligne(avant)?.derniereSyncA).toBeNull();

      await get(agent.jeton, '/api/v1/sync/pull?since=0').expect(200);
      const apresPull = await get(superviseur, '/api/v1/agents');
      expect(ligne(apresPull)?.derniereSyncA).toBe(HORLOGE.toISOString());

      await request(http)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${agent.jeton}`)
        .send({})
        .expect(200);
      const enBase = await ctx.prisma.agent.findUniqueOrThrow({
        where: { id: agent.agent.id },
      });
      expect(enBase.derniereSyncA?.toISOString()).toBe(HORLOGE.toISOString());
    });
  });

  describe('horloge des téléphones (POST /sync/push)', () => {
    function pousser(jeton: string, corps: Record<string, unknown>) {
      return request(http)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${jeton}`)
        .send(corps);
    }

    it('AC-3, AC-5, AC-6 : corrige les dates d’un téléphone en avance de 2 h et garde l’écart', async () => {
      const { agent, jeton } = await connecter();
      const contrat = await contratDe(agent.id);
      const enAvance = 120 * MINUTE;
      const id = randomUUID();

      const res = await pousser(jeton, {
        horlogeClient: new Date(HORLOGE.getTime() + enAvance).toISOString(),
        versements: [
          {
            id,
            contratId: contrat.id,
            misesCount: 1,
            // Encaissé 5 min avant l'envoi, à l'heure (fausse) du téléphone.
            paidAt: new Date(
              HORLOGE.getTime() + enAvance - 5 * MINUTE,
            ).toISOString(),
          },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ conflicts: [] });
      const v = await ctx.prisma.versement.findUniqueOrThrow({
        where: { id },
      });
      expect(v.paidAt.toISOString()).toBe(
        new Date(HORLOGE.getTime() - 5 * MINUTE).toISOString(),
      );
      expect(v.ecartHorlogeS).toBe(-7200);

      // AC-6 : la caisse montre l'écart corrigé.
      const caisse = await get(
        jeton,
        `/api/v1/caisse/agents/${agent.id}?date=2026-10-30`,
      );
      expect(
        corps<{ lignes: { id: string; ecartHorlogeS: number | null }[] }>(
          caisse,
        ).lignes.find((l) => l.id === id)?.ecartHorlogeS,
      ).toBe(-7200);

      // AC-5 : un rejeu avec une autre horloge ne change rien.
      await pousser(jeton, {
        horlogeClient: new Date(HORLOGE.getTime() - enAvance).toISOString(),
        versements: [
          {
            id,
            contratId: contrat.id,
            misesCount: 1,
            paidAt: HORLOGE.toISOString(),
          },
        ],
      }).expect(200);
      const rejoue = await ctx.prisma.versement.findUniqueOrThrow({
        where: { id },
      });
      expect(rejoue.paidAt).toEqual(v.paidAt);
      expect(rejoue.ecartHorlogeS).toBe(-7200);
    });

    it('AC-4 : sans horlogeClient, la même date reste un conflit (spec 0003)', async () => {
      const { agent, jeton } = await connecter();
      const contrat = await contratDe(agent.id);

      const res = await pousser(jeton, {
        versements: [
          {
            id: randomUUID(),
            contratId: contrat.id,
            misesCount: 1,
            paidAt: new Date(HORLOGE.getTime() + 115 * MINUTE).toISOString(),
          },
        ],
      });

      expect(res.status).toBe(200);
      expect(corps<{ conflicts: unknown[] }>(res).conflicts).toHaveLength(1);
    });

    it('AC-4 : ne corrige rien dans la tolérance de 15 minutes', async () => {
      const { agent, jeton } = await connecter();
      const contrat = await contratDe(agent.id);
      const id = randomUUID();
      const paidAt = new Date(HORLOGE.getTime() - 30 * MINUTE).toISOString();

      await pousser(jeton, {
        horlogeClient: new Date(HORLOGE.getTime() + 10 * MINUTE).toISOString(),
        versements: [{ id, contratId: contrat.id, misesCount: 1, paidAt }],
      }).expect(200);

      const v = await ctx.prisma.versement.findUniqueOrThrow({
        where: { id },
      });
      expect(v.paidAt.toISOString()).toBe(paidAt);
      expect(v.ecartHorlogeS).toBeNull();
    });

    it('AC-2 : refuse un horlogeClient mal formé (400)', async () => {
      const { jeton } = await connecter();
      const res = await pousser(jeton, { horlogeClient: '2026-10-30 12:00' });
      expect(res.status).toBe(400);
    });
  });

  describe('doublons (GET /membres/verifier-telephone)', () => {
    it('AC-7, AC-8 : trouve le membre d’un autre agent sans révéler sa fiche', async () => {
      const { agent: autre } = await creerAgent(ctx.prisma, {
        nom: 'Agent Nord',
        numeroAgent: 7,
      });
      const membre = await creerMembre(ctx.prisma, autre.id, {
        telephone: '+229 97 00 00 01',
        numeroMembre: 'MBR-00042',
      });
      const { jeton } = await connecter();

      const res = await get(
        jeton,
        '/api/v1/membres/verifier-telephone?telephone=97000001',
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        existe: true,
        membres: [
          {
            id: null,
            numeroMembre: 'MBR-00042',
            nom: null,
            prenoms: null,
            estAMoi: false,
            agent: { nom: 'Agent Nord', numeroAgent: 7 },
          },
        ],
      });

      const { jeton: superviseur } = await connecter('SUPERVISEUR');
      const vu = await get(
        superviseur,
        '/api/v1/membres/verifier-telephone?telephone=22997000001',
      );
      expect(vu.body).toMatchObject({
        existe: true,
        membres: [
          {
            id: membre.id,
            nom: membre.nom,
            agent: { id: autre.id, nom: 'Agent Nord' },
          },
        ],
      });
    });

    it('AC-7 : répond existe: false pour un numéro inconnu, 400 pour un numéro trop court', async () => {
      const { jeton } = await connecter();
      const inconnu = await get(
        jeton,
        '/api/v1/membres/verifier-telephone?telephone=96000000',
      );
      expect(inconnu.body).toEqual({ existe: false, membres: [] });

      const court = await get(
        jeton,
        '/api/v1/membres/verifier-telephone?telephone=1234',
      );
      expect(court.status).toBe(400);
    });
  });

  describe('courbe par jour (GET /dashboard/serie)', () => {
    it('AC-9 : donne un point par jour du Bénin, à zéro les jours vides', async () => {
      const { agent, jeton } = await connecter();
      const contrat = await contratDe(agent.id);
      // 29 octobre à 23:30 au Bénin (22:30Z) : compte pour le 29, pas le 30.
      await creerVersement(ctx.prisma, contrat, agent.id, {
        misesCount: 2,
        paidAt: new Date('2026-10-29T22:30:00Z'),
      });
      await creerVersement(ctx.prisma, contrat, agent.id, {
        misesCount: 1,
        paidAt: new Date('2026-10-30T08:00:00Z'),
      });
      const avance = await creerAvance(ctx.prisma, contrat, agent.id, {
        dateAvance: new Date('2026-10-30T09:00:00Z'),
      });
      const retrait = await creerRetrait(ctx.prisma, contrat, agent.id, {
        dateRetrait: new Date('2026-10-30T10:00:00Z'),
      });
      const mise = Number(contrat.miseAmount);

      const res = await get(jeton, '/api/v1/dashboard/serie?jours=3');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        du: '2026-10-28',
        au: '2026-10-30',
        fuseau: 'Africa/Porto-Novo',
        agentId: agent.id,
        points: [
          {
            date: '2026-10-28',
            encaisse: 0,
            nbVersements: 0,
            avances: 0,
            retraitsNets: 0,
          },
          {
            date: '2026-10-29',
            encaisse: 2 * mise,
            nbVersements: 1,
            avances: 0,
            retraitsNets: 0,
          },
          {
            date: '2026-10-30',
            encaisse: mise,
            nbVersements: 1,
            avances: Number(avance.montant),
            retraitsNets: Number(retrait.montantNet),
          },
        ],
      });
    });

    it('AC-9, AC-10 : 14 jours par défaut ; un AGENT ne lit pas la courbe d’un autre (404)', async () => {
      const { jeton } = await connecter();
      const { agent: autre } = await creerAgent(ctx.prisma);

      const defaut = await get(jeton, '/api/v1/dashboard/serie');
      expect(corps<{ points: unknown[] }>(defaut).points).toHaveLength(14);

      const interdit = await get(
        jeton,
        `/api/v1/dashboard/serie?agentId=${autre.id}`,
      );
      expect(interdit.status).toBe(404);

      const tropLong = await get(jeton, '/api/v1/dashboard/serie?jours=91');
      expect(tropLong.status).toBe(400);
    });

    it('AC-10 : le superviseur voit tous les agents, ou un seul', async () => {
      const a = await connecter();
      const b = await connecter();
      const { jeton } = await connecter('SUPERVISEUR');
      await creerVersement(
        ctx.prisma,
        await contratDe(a.agent.id),
        a.agent.id,
        {
          paidAt: new Date('2026-10-30T08:00:00Z'),
        },
      );
      await creerVersement(
        ctx.prisma,
        await contratDe(b.agent.id),
        b.agent.id,
        {
          paidAt: new Date('2026-10-30T09:00:00Z'),
        },
      );

      const tous = await get(jeton, '/api/v1/dashboard/serie?jours=1');
      expect(tous.body).toMatchObject({
        agentId: null,
        points: [{ date: '2026-10-30', nbVersements: 2 }],
      });

      const un = await get(
        jeton,
        `/api/v1/dashboard/serie?jours=1&agentId=${a.agent.id}`,
      );
      expect(un.body).toMatchObject({
        agentId: a.agent.id,
        points: [{ date: '2026-10-30', nbVersements: 1 }],
      });
    });
  });
});
