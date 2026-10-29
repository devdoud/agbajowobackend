import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { Agent } from '@prisma/client';
import { jourBenin } from '@/domain/caisse';
import {
  corps,
  creerAppDeTest,
  seConnecter,
  type AppDeTest,
} from '../support/app';
import { viderBase } from '../support/base';
import {
  MOT_DE_PASSE_TEST,
  creerAgent,
  creerAvance,
  creerContrat,
  creerMembre,
  creerRetrait,
  creerVersement,
} from '../support/fabriques';

/**
 * Réceptions tardives (spec 0002, AC-13 à AC-18). Jour D = 2026-10-20 au Bénin,
 * soit [19 oct. 23:00 UTC, 20 oct. 23:00 UTC[. `createdAt` est posé à la main :
 * il vient de l'horloge de la base, pas de `ClockService`.
 */
const D = '2026-10-20';
const RECU_D = new Date('2026-10-20T11:00:00Z');

interface Totaux {
  encaisse: string;
  avances: string;
  retraitsNets: string;
  decaisse: string;
  soldeAttendu: string;
  nbMouvements: number;
}

interface Receptions {
  nbMouvements: number;
  effetSolde: string;
}

interface CorpsRapport {
  totaux: Totaux;
  arriveesTardives: number;
  lignes: { id: string }[];
  receptionsTardives: Receptions & {
    parJour: (Omit<Totaux, 'soldeAttendu'> & {
      date: string;
      effetSolde: string;
    })[];
    lignes: {
      id: string;
      type: string;
      montant: string;
      jourTerrain: string;
      arriveeTardive: boolean;
      membre: { id: string };
    }[];
  };
}

interface CorpsSynthese {
  receptionsTardives: Receptions;
  agents: {
    agent: { id: string; nom: string; actif: boolean };
    totaux: Totaux;
    receptionsTardives: Receptions;
  }[];
}

describe('réceptions tardives du rapport de caisse (spec 0002)', () => {
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

  async function compte(opts: Parameters<typeof creerAgent>[1] = {}) {
    const { agent } = await creerAgent(ctx.prisma, opts);
    const membre = await creerMembre(ctx.prisma, agent.id);
    const contrat = await creerContrat(ctx.prisma, membre);
    return { agent, membre, contrat };
  }

  function jeton(agent: Agent) {
    return seConnecter(ctx.app, agent.telephone, MOT_DE_PASSE_TEST);
  }

  async function lire<T>(token: string, chemin: string): Promise<T> {
    const res = await request(http)
      .get(`/api/v1/caisse${chemin}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    return corps<T>(res);
  }

  it('signale le jour de réception, par jour terrain, sans changer le jour D (AC-13, AC-14, AC-15)', async () => {
    const { agent, membre, contrat } = await compte();
    const vieux = await creerVersement(ctx.prisma, contrat, agent.id, {
      misesCount: 3,
      paidAt: new Date('2026-10-18T10:00:00Z'),
      createdAt: RECU_D,
    });
    const avance = await creerAvance(ctx.prisma, contrat, agent.id, {
      montant: 600n,
      dateAvance: new Date('2026-10-19T10:00:00Z'),
      createdAt: RECU_D,
    });
    const duJour = await creerVersement(ctx.prisma, contrat, agent.id, {
      paidAt: new Date('2026-10-20T09:00:00Z'),
    });

    const r = await lire<CorpsRapport>(
      await jeton(agent),
      `/agents/${agent.id}?date=${D}`,
    );

    // Le jour D ne compte que son propre mouvement (AC-15).
    expect(r.totaux).toMatchObject({ encaisse: '500', nbMouvements: 1 });
    expect(r.lignes.map((l) => l.id)).toEqual([duJour.id]);
    expect(r.arriveesTardives).toBe(0);
    expect(r.receptionsTardives).toEqual({
      nbMouvements: 2,
      effetSolde: '900',
      parJour: [
        {
          date: '2026-10-18',
          nbMouvements: 1,
          encaisse: '1500',
          avances: '0',
          retraitsNets: '0',
          decaisse: '0',
          effetSolde: '1500',
        },
        {
          date: '2026-10-19',
          nbMouvements: 1,
          encaisse: '0',
          avances: '600',
          retraitsNets: '0',
          decaisse: '600',
          effetSolde: '-600',
        },
      ],
      lignes: [
        expect.objectContaining({
          id: vieux.id,
          type: 'VERSEMENT',
          montant: '1500',
          jourTerrain: '2026-10-18',
          arriveeTardive: true,
        }),
        expect.objectContaining({
          id: avance.id,
          type: 'AVANCE',
          jourTerrain: '2026-10-19',
          arriveeTardive: true,
        }),
      ],
    });
    expect(r.receptionsTardives.lignes[0].membre.id).toBe(membre.id);
  });

  it('compte le même mouvement côté jour terrain et côté jour de réception (AC-17)', async () => {
    const { agent, contrat } = await compte();
    await creerRetrait(ctx.prisma, contrat, agent.id, {
      montantNet: 1000n,
      dateRetrait: new Date('2026-10-18T10:00:00Z'),
      createdAt: RECU_D,
    });
    const token = await jeton(agent);

    const jourTerrain = await lire<CorpsRapport>(
      token,
      `/agents/${agent.id}?date=2026-10-18`,
    );
    const jourReception = await lire<CorpsRapport>(
      token,
      `/agents/${agent.id}?date=${D}`,
    );

    expect(jourTerrain.arriveesTardives).toBe(1);
    expect(jourTerrain.totaux.soldeAttendu).toBe('-1000');
    expect(jourReception.receptionsTardives.effetSolde).toBe(
      jourTerrain.totaux.soldeAttendu,
    );
  });

  it('rend la clé vide sans réception tardive (AC-14)', async () => {
    const { agent } = await compte();

    const r = await lire<CorpsRapport>(
      await jeton(agent),
      `/agents/${agent.id}?date=${D}`,
    );

    expect(r.receptionsTardives).toEqual({
      nbMouvements: 0,
      effetSolde: '0',
      parJour: [],
      lignes: [],
    });
  });

  it("n'appelle pas tardive une réception juste avant le jour terrain (AC-13)", async () => {
    const { agent, contrat } = await compte();
    // Daté du 21 à 00:05 au Bénin, reçu le 20 à 23:55 au Bénin.
    const precoce = await creerVersement(ctx.prisma, contrat, agent.id, {
      paidAt: new Date('2026-10-20T23:05:00Z'),
      createdAt: new Date('2026-10-20T22:55:00Z'),
    });
    const token = await jeton(agent);

    const jourD = await lire<CorpsRapport>(
      token,
      `/agents/${agent.id}?date=${D}`,
    );
    const lendemain = await lire<CorpsRapport>(
      token,
      `/agents/${agent.id}?date=2026-10-21`,
    );

    expect(jourD.lignes).toEqual([]);
    expect(jourD.receptionsTardives.nbMouvements).toBe(0);
    expect(lendemain.lignes.map((l) => l.id)).toEqual([precoce.id]);
    expect(lendemain.arriveesTardives).toBe(0);
  });

  it('montre dans la synthèse un compte qui n’a qu’une réception tardive, égal à son détail (AC-16)', async () => {
    const { agent: actif, contrat } = await compte({ nom: 'Actif' });
    const { agent: desactive } = await creerAgent(ctx.prisma, {
      nom: 'Désactivé',
      actif: false,
    });
    await creerVersement(ctx.prisma, contrat, desactive.id, {
      misesCount: 2,
      paidAt: new Date('2026-10-19T10:00:00Z'),
      createdAt: RECU_D,
    });
    await creerRetrait(ctx.prisma, contrat, actif.id, {
      montantNet: 400n,
      dateRetrait: new Date('2026-10-18T10:00:00Z'),
      createdAt: RECU_D,
    });
    const { agent: superviseur } = await creerAgent(ctx.prisma, {
      role: 'SUPERVISEUR',
    });
    const tokenSup = await jeton(superviseur);

    const s = await lire<CorpsSynthese>(tokenSup, `?date=${D}`);

    expect(s.agents.map((a) => a.agent.nom)).toEqual(['Actif', 'Désactivé']);
    const ligneDesactive = s.agents[1];
    expect(ligneDesactive.totaux.nbMouvements).toBe(0);
    expect(ligneDesactive.receptionsTardives).toEqual({
      nbMouvements: 1,
      effetSolde: '1000',
    });
    for (const ligne of s.agents) {
      const detail = await lire<CorpsRapport>(
        tokenSup,
        `/agents/${ligne.agent.id}?date=${D}`,
      );
      expect(ligne.receptionsTardives).toEqual({
        nbMouvements: detail.receptionsTardives.nbMouvements,
        effetSolde: detail.receptionsTardives.effetSolde,
      });
    }
    expect(s.receptionsTardives).toEqual({
      nbMouvements: 2,
      effetSolde: '600',
    });
  });

  it('ne montre à un AGENT que ses propres réceptions tardives (AC-18)', async () => {
    const { agent, contrat } = await compte();
    const { agent: autre } = await compte();
    await creerVersement(ctx.prisma, contrat, autre.id, {
      paidAt: new Date('2026-10-19T10:00:00Z'),
      createdAt: RECU_D,
    });
    const token = await jeton(agent);

    const siennes = await lire<CorpsRapport>(
      token,
      `/agents/${agent.id}?date=${D}`,
    );
    const horsPortee = await request(http)
      .get(`/api/v1/caisse/agents/${autre.id}?date=${D}`)
      .set('Authorization', `Bearer ${token}`);

    expect(siennes.receptionsTardives.nbMouvements).toBe(0);
    expect(horsPortee.status).toBe(404);
  });

  it('signale aujourd’hui un versement d’hier poussé par la vraie synchro (AC-13, AC-15, AC-17)', async () => {
    // Chemin d'écriture réel : `createdAt` vient de l'horloge de la base.
    const { agent } = await creerAgent(ctx.prisma);
    const membre = await creerMembre(ctx.prisma, agent.id);
    const contrat = await creerContrat(ctx.prisma, membre, {
      startDate: new Date(Date.now() - 10 * 86_400_000),
    });
    const token = await jeton(agent);
    const hier = jourBenin(new Date(Date.now() - 86_400_000));
    const id = randomUUID();

    const push = await request(http)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        versements: [
          {
            id,
            contratId: contrat.id,
            misesCount: 2,
            paidAt: `${hier}T11:00:00Z`,
          },
        ],
      });
    const aujourdhui = await lire<CorpsRapport>(token, `/agents/${agent.id}`);
    const rapportHier = await lire<CorpsRapport>(
      token,
      `/agents/${agent.id}?date=${hier}`,
    );

    expect(corps<{ conflicts: unknown[] }>(push).conflicts).toEqual([]);
    expect(aujourdhui.totaux.nbMouvements).toBe(0);
    expect(aujourdhui.receptionsTardives).toMatchObject({
      nbMouvements: 1,
      effetSolde: '1000',
      parJour: [{ date: hier, encaisse: '1000' }],
    });
    expect(aujourdhui.receptionsTardives.lignes.map((l) => l.id)).toEqual([id]);
    expect(rapportHier.lignes.map((l) => l.id)).toEqual([id]);
    expect(rapportHier.arriveesTardives).toBe(1);
  });

  it('montre dans la synthèse un compte supprimé qui n’a qu’une réception tardive (AC-16)', async () => {
    const { contrat } = await compte({ nom: 'Actif' });
    const { agent: supprime } = await creerAgent(ctx.prisma, {
      nom: 'Supprimé',
      deletedAt: new Date(),
    });
    await creerVersement(ctx.prisma, contrat, supprime.id, {
      paidAt: new Date('2026-10-19T10:00:00Z'),
      createdAt: RECU_D,
    });
    const { agent: superviseur } = await creerAgent(ctx.prisma, {
      role: 'SUPERVISEUR',
    });

    const s = await lire<CorpsSynthese>(await jeton(superviseur), `?date=${D}`);

    expect(s.agents.map((a) => a.agent.nom)).toEqual(['Actif', 'Supprimé']);
    expect(s.agents[1]).toMatchObject({
      totaux: { nbMouvements: 0 },
      receptionsTardives: { nbMouvements: 1, effetSolde: '500' },
    });
  });
});
