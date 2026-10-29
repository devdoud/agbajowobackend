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
  type CorpsErreur,
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

/** Jour passé de référence : au Bénin, il couvre [19 oct. 23:00 UTC, 20 oct. 23:00 UTC[. */
const JOUR = '2026-10-20';
const MIDI = new Date('2026-10-20T11:00:00Z');

interface Totaux {
  encaisse: string;
  avances: string;
  retraitsNets: string;
  decaisse: string;
  soldeAttendu: string;
  nbMouvements: number;
}

interface AgentRapport {
  id: string;
  nom: string;
  role: string;
  actif: boolean;
  supprime: boolean;
}

interface Ligne {
  type: 'VERSEMENT' | 'AVANCE' | 'RETRAIT';
  id: string;
  receiptNumber: string | null;
  dateTerrain: string;
  recuServeurA: string;
  arriveeTardive: boolean;
  montant: string;
  contratId: string;
  membre: {
    id: string;
    nom: string;
    prenoms: string;
    numeroMembre: string | null;
    codeMembre: string | null;
  };
  misesCount?: number;
  typeRetrait?: string;
  montantBrut?: string;
  commissionPrelevee?: string;
  interetDu?: string;
}

interface CorpsRapport {
  agent: AgentRapport;
  date: string;
  fuseau: string;
  genereA: string;
  totaux: Totaux;
  soldeNegatif: boolean;
  arriveesTardives: number;
  lignes: Ligne[];
}

interface CorpsSynthese {
  date: string;
  fuseau: string;
  totaux: Totaux;
  soldeNegatif: boolean;
  arriveesTardives: number;
  agents: {
    agent: AgentRapport;
    totaux: Totaux;
    soldeNegatif: boolean;
    arriveesTardives: number;
  }[];
}

describe('GET /api/v1/caisse (rapport de caisse)', () => {
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

  /** Un compte connecté, avec un membre et un contrat à lui. */
  async function compte(opts: Parameters<typeof creerAgent>[1] = {}) {
    const { agent } = await creerAgent(ctx.prisma, opts);
    const membre = await creerMembre(ctx.prisma, agent.id);
    const contrat = await creerContrat(ctx.prisma, membre);
    return { agent, membre, contrat };
  }

  async function jeton(agent: Agent) {
    return seConnecter(ctx.app, agent.telephone, MOT_DE_PASSE_TEST);
  }

  function lire(token: string, chemin: string) {
    return request(http)
      .get(`/api/v1/caisse${chemin}`)
      .set('Authorization', `Bearer ${token}`);
  }

  async function rapport(token: string, agentId: string, date = JOUR) {
    const res = await lire(token, `/agents/${agentId}?date=${date}`);
    expect(res.status).toBe(200);
    return corps<CorpsRapport>(res);
  }

  it('donne encaissé, décaissé, solde et une ligne par mouvement (AC-1, AC-4, AC-7)', async () => {
    const { agent, membre, contrat } = await compte();
    const v1 = await creerVersement(ctx.prisma, contrat, agent.id, {
      misesCount: 3,
      paidAt: MIDI,
      receiptNumber: 'REC-20261020-00001',
    });
    await creerVersement(ctx.prisma, contrat, agent.id, {
      misesCount: 2,
      paidAt: new Date('2026-10-20T09:00:00Z'),
    });
    await creerAvance(ctx.prisma, contrat, agent.id, {
      montant: 600n,
      dateAvance: new Date('2026-10-20T12:00:00Z'),
    });
    const r = await creerRetrait(ctx.prisma, contrat, agent.id, {
      montantNet: 400n,
      montantBrut: 900n,
      commissionPrelevee: 500n,
      dateRetrait: new Date('2026-10-20T13:00:00Z'),
    });

    const res = await rapport(await jeton(agent), agent.id);

    expect(res).toMatchObject({
      agent: { id: agent.id, role: 'AGENT', actif: true, supprime: false },
      date: JOUR,
      fuseau: 'Africa/Porto-Novo',
      totaux: {
        encaisse: '2500',
        avances: '600',
        retraitsNets: '400',
        decaisse: '1000',
        soldeAttendu: '1500',
        nbMouvements: 4,
      },
      soldeNegatif: false,
      arriveesTardives: 0,
    });
    expect(res.lignes.map((l) => l.type)).toEqual([
      'VERSEMENT',
      'VERSEMENT',
      'AVANCE',
      'RETRAIT',
    ]);
    const versement = res.lignes.find((l) => l.id === v1.id);
    expect(versement).toMatchObject({
      receiptNumber: 'REC-20261020-00001',
      montant: '1500',
      misesCount: 3,
      contratId: contrat.id,
      dateTerrain: MIDI.toISOString(),
      arriveeTardive: false,
      membre: { id: membre.id, nom: membre.nom, prenoms: membre.prenoms },
    });
    expect(versement).not.toHaveProperty('montantBrut');
    expect(res.lignes.find((l) => l.id === r.id)).toMatchObject({
      montant: '400',
      typeRetrait: 'PARTIEL',
      montantBrut: '900',
      commissionPrelevee: '500',
      interetDu: '0',
    });
    expect(res.lignes[2]).not.toHaveProperty('misesCount');
  });

  it('range un mouvement selon le jour du Bénin (AC-3)', async () => {
    const { agent, contrat } = await compte();
    const avantMinuit = await creerVersement(ctx.prisma, contrat, agent.id, {
      paidAt: new Date('2026-10-19T23:30:00Z'), // 20 oct. 00:30 au Bénin
    });
    await creerVersement(ctx.prisma, contrat, agent.id, {
      paidAt: new Date('2026-10-20T23:30:00Z'), // 21 oct. 00:30 au Bénin
    });
    await creerVersement(ctx.prisma, contrat, agent.id, {
      paidAt: new Date('2026-10-19T22:59:00Z'), // 19 oct. 23:59 au Bénin
    });

    const res = await rapport(await jeton(agent), agent.id);

    expect(res.lignes.map((l) => l.id)).toEqual([avantMinuit.id]);
  });

  it("compte un mouvement pour qui l'a fait, pas pour le propriétaire du contrat (AC-2)", async () => {
    const { agent, contrat } = await compte();
    const { agent: superviseur } = await creerAgent(ctx.prisma, {
      role: 'SUPERVISEUR',
    });
    await creerVersement(ctx.prisma, contrat, superviseur.id, { paidAt: MIDI });
    const tokenSup = await jeton(superviseur);

    const duSuperviseur = await rapport(tokenSup, superviseur.id);
    const deLAgent = await rapport(tokenSup, agent.id);

    expect(duSuperviseur.totaux.nbMouvements).toBe(1);
    expect(deLAgent.totaux.nbMouvements).toBe(0);
  });

  it('autorise un solde négatif et le signale (AC-5)', async () => {
    const { agent, contrat } = await compte();
    await creerRetrait(ctx.prisma, contrat, agent.id, {
      montantNet: 4500n,
      dateRetrait: MIDI,
    });

    const res = await rapport(await jeton(agent), agent.id);

    expect(res.totaux.soldeAttendu).toBe('-4500');
    expect(res.soldeNegatif).toBe(true);
  });

  it('signale un mouvement reçu après la fin de son jour (AC-6)', async () => {
    const { agent, contrat } = await compte();
    const tardif = await creerVersement(ctx.prisma, contrat, agent.id, {
      paidAt: MIDI,
      createdAt: new Date('2026-10-21T08:00:00Z'),
    });
    await creerVersement(ctx.prisma, contrat, agent.id, {
      paidAt: MIDI,
      createdAt: MIDI,
    });

    const res = await rapport(await jeton(agent), agent.id);

    expect(res.arriveesTardives).toBe(1);
    expect(res.lignes.find((l) => l.id === tardif.id)?.arriveeTardive).toBe(
      true,
    );
    expect(res.totaux.encaisse).toBe('1000');
  });

  it("prend aujourd'hui au Bénin par défaut (AC-8)", async () => {
    const { agent, contrat } = await compte();
    const token = await jeton(agent);
    const enc = await request(http)
      .post('/api/v1/versements')
      .set('Authorization', `Bearer ${token}`)
      .send({ contratId: contrat.id, misesCount: 1 });
    expect(enc.status).toBe(201);

    const res = await lire(token, `/agents/${agent.id}`);

    expect(res.status).toBe(200);
    const corpsRes = corps<CorpsRapport>(res);
    expect(corpsRes.date).toBe(jourBenin(new Date()));
    expect(corpsRes.totaux.nbMouvements).toBe(1);
    expect(corpsRes.arriveesTardives).toBe(0);
  });

  it('refuse une date invalide, inexistante ou future, et un id non uuid (AC-8)', async () => {
    const { agent } = await compte();
    const token = await jeton(agent);
    const demain = jourBenin(new Date(Date.now() + 86_400_000));

    for (const chemin of [
      `/agents/${agent.id}?date=2026-02-30`,
      `/agents/${agent.id}?date=29-10-2026`,
      `/agents/${agent.id}?date=${demain}`,
      '/agents/pas-un-uuid',
    ]) {
      const res = await lire(token, chemin);
      expect(res.status).toBe(400);
      expect(corps<CorpsErreur>(res).code).toBe('VALIDATION_ERROR');
    }
  });

  it('limite un AGENT à son propre rapport et ouvre tout au superviseur (AC-9)', async () => {
    const { agent } = await compte();
    const { agent: autre } = await compte();
    const { agent: admin } = await creerAgent(ctx.prisma, { role: 'ADMIN' });
    const { agent: supprime } = await creerAgent(ctx.prisma, {
      actif: false,
      deletedAt: new Date(),
    });
    const { agent: superviseur } = await creerAgent(ctx.prisma, {
      role: 'SUPERVISEUR',
    });
    const tokenAgent = await jeton(agent);
    const tokenSup = await jeton(superviseur);

    const horsPortee = await lire(
      tokenAgent,
      `/agents/${autre.id}?date=${JOUR}`,
    );
    expect(horsPortee.status).toBe(404);
    expect(corps<CorpsErreur>(horsPortee).code).toBe('NOT_FOUND');

    const inconnu = await lire(
      tokenSup,
      `/agents/${randomUUID()}?date=${JOUR}`,
    );
    expect(inconnu.status).toBe(404);

    expect((await rapport(tokenSup, admin.id)).agent.role).toBe('ADMIN');
    expect((await rapport(tokenSup, supprime.id)).agent).toMatchObject({
      actif: false,
      supprime: true,
    });
  });

  it('garde la ligne et le membre même si le membre est supprimé (AC-7, AC-12)', async () => {
    const { agent, membre, contrat } = await compte();
    await creerVersement(ctx.prisma, contrat, agent.id, { paidAt: MIDI });
    await ctx.prisma.membre.update({
      where: { id: membre.id },
      data: { deletedAt: new Date() },
    });

    const res = await rapport(await jeton(agent), agent.id);

    expect(res.lignes).toHaveLength(1);
    expect(res.lignes[0].membre.id).toBe(membre.id);
  });

  it('départage deux mouvements à la même heure par type, puis par id (AC-7)', async () => {
    const { agent, contrat } = await compte();
    // Créés dans l'ordre inverse de l'ordre attendu.
    await creerRetrait(ctx.prisma, contrat, agent.id, { dateRetrait: MIDI });
    await creerAvance(ctx.prisma, contrat, agent.id, { dateAvance: MIDI });
    await creerVersement(ctx.prisma, contrat, agent.id, { paidAt: MIDI });
    await creerVersement(ctx.prisma, contrat, agent.id, { paidAt: MIDI });

    const res = await rapport(await jeton(agent), agent.id);

    expect(res.lignes.map((l) => l.type)).toEqual([
      'VERSEMENT',
      'VERSEMENT',
      'AVANCE',
      'RETRAIT',
    ]);
    const [v1, v2] = res.lignes;
    expect(v1.id < v2.id).toBe(true);
  });

  it('rend un rapport à zéro, sans ligne, pour un agent sans mouvement ce jour là (AC-1, AC-5)', async () => {
    const { agent } = await compte();

    const res = await rapport(await jeton(agent), agent.id);

    expect(res.totaux).toEqual({
      encaisse: '0',
      avances: '0',
      retraitsNets: '0',
      decaisse: '0',
      soldeAttendu: '0',
      nbMouvements: 0,
    });
    expect(res.lignes).toEqual([]);
    expect(res.soldeNegatif).toBe(false);
    expect(res.arriveesTardives).toBe(0);
  });

  it("accepte la date d'aujourd'hui au Bénin, seul le futur est refusé (AC-8)", async () => {
    const { agent } = await compte();
    const aujourdhui = jourBenin(new Date());

    const res = await rapport(await jeton(agent), agent.id, aujourdhui);

    expect(res.date).toBe(aujourdhui);
  });

  it('refuse un appel sans jeton (401)', async () => {
    const { agent } = await compte();

    const detail = await request(http).get(`/api/v1/caisse/agents/${agent.id}`);
    const synthese = await request(http).get('/api/v1/caisse');

    expect(detail.status).toBe(401);
    expect(synthese.status).toBe(401);
    expect(corps<CorpsErreur>(detail).code).toBe('UNAUTHENTICATED');
  });

  describe('synthèse de la journée (AC-10)', () => {
    it('liste les agents actifs et ceux qui ont bougé, avec les mêmes totaux que le détail', async () => {
      const { agent: bea, contrat } = await compte({ nom: 'Béatrice' });
      await compte({ nom: 'Abdou' }); // actif, aucun mouvement
      const { agent: desactive } = await creerAgent(ctx.prisma, {
        nom: 'Zinsou',
        actif: false,
      });
      await creerAgent(ctx.prisma, { nom: 'Inactif', actif: false });
      const { agent: superviseur } = await creerAgent(ctx.prisma, {
        nom: 'Chef',
        role: 'SUPERVISEUR',
      });
      await creerVersement(ctx.prisma, contrat, bea.id, {
        misesCount: 4,
        paidAt: MIDI,
      });
      await creerRetrait(ctx.prisma, contrat, bea.id, {
        montantNet: 500n,
        dateRetrait: MIDI,
      });
      await creerVersement(ctx.prisma, contrat, desactive.id, {
        paidAt: MIDI,
        createdAt: new Date('2026-10-22T08:00:00Z'),
      });
      const tokenSup = await jeton(superviseur);

      const res = await lire(tokenSup, `?date=${JOUR}`);

      expect(res.status).toBe(200);
      const synthese = corps<CorpsSynthese>(res);
      expect(synthese.agents.map((a) => a.agent.nom)).toEqual([
        'Abdou',
        'Béatrice',
        'Zinsou',
      ]);
      expect(synthese.agents[0].totaux.nbMouvements).toBe(0);
      expect(synthese.totaux).toMatchObject({
        encaisse: '2500',
        retraitsNets: '500',
        soldeAttendu: '2000',
        nbMouvements: 3,
      });
      expect(synthese.arriveesTardives).toBe(1);

      for (const ligne of synthese.agents) {
        const detail = await rapport(tokenSup, ligne.agent.id);
        expect(ligne.totaux).toEqual(detail.totaux);
        expect(ligne.soldeNegatif).toBe(detail.soldeNegatif);
        expect(ligne.arriveesTardives).toBe(detail.arriveesTardives);
      }
    });

    it('est interdite à un AGENT (403)', async () => {
      const { agent } = await compte();

      const res = await lire(await jeton(agent), `?date=${JOUR}`);

      expect(res.status).toBe(403);
      expect(corps<CorpsErreur>(res).code).toBe('FORBIDDEN');
    });

    it('est ouverte à un ADMIN', async () => {
      const { agent: admin } = await creerAgent(ctx.prisma, { role: 'ADMIN' });

      const res = await lire(await jeton(admin), `?date=${JOUR}`);

      expect(res.status).toBe(200);
    });

    it('montre un compte supprimé qui a bougé, et ignore un AGENT supprimé sans mouvement', async () => {
      const { contrat } = await compte({ nom: 'Actif' });
      const { agent: supprimeActif } = await creerAgent(ctx.prisma, {
        nom: 'Supprimé avec mouvement',
        deletedAt: new Date(),
      });
      await creerAgent(ctx.prisma, {
        nom: 'Supprimé sans mouvement',
        deletedAt: new Date(),
      });
      await creerVersement(ctx.prisma, contrat, supprimeActif.id, {
        paidAt: MIDI,
      });
      const { agent: superviseur } = await creerAgent(ctx.prisma, {
        role: 'SUPERVISEUR',
      });

      const synthese = corps<CorpsSynthese>(
        await lire(await jeton(superviseur), `?date=${JOUR}`),
      );

      expect(synthese.agents.map((a) => a.agent.nom)).toEqual([
        'Actif',
        'Supprimé avec mouvement',
      ]);
      expect(synthese.agents[1].agent.supprime).toBe(true);
      expect(synthese.agents[1].totaux.nbMouvements).toBe(1);
    });

    it('signale une journée où tout le monde a plus décaissé qu’encaissé (AC-5)', async () => {
      const { agent, contrat } = await compte();
      await creerRetrait(ctx.prisma, contrat, agent.id, {
        montantNet: 3000n,
        dateRetrait: MIDI,
      });
      const { agent: superviseur } = await creerAgent(ctx.prisma, {
        role: 'SUPERVISEUR',
      });

      const synthese = corps<CorpsSynthese>(
        await lire(await jeton(superviseur), `?date=${JOUR}`),
      );

      expect(synthese.totaux.soldeAttendu).toBe('-3000');
      expect(synthese.soldeNegatif).toBe(true);
      expect(synthese.agents[0].soldeNegatif).toBe(true);
    });

    it("prend aujourd'hui au Bénin quand la date est absente (AC-8)", async () => {
      const { agent: superviseur } = await creerAgent(ctx.prisma, {
        role: 'SUPERVISEUR',
      });

      const res = await lire(await jeton(superviseur), '');

      expect(res.status).toBe(200);
      expect(corps<CorpsSynthese>(res).date).toBe(jourBenin(new Date()));
    });
  });
});
