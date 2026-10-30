import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type RoleAgent } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ClockService } from '@/common/clock/clock.service';
import {
  FUSEAU_CAISSE,
  bornesJour,
  calculerRapportCaisse,
  estArriveeTardive,
  jourBenin,
  regrouperReceptionsTardives,
  trierLignes,
  type LigneCaisse,
  type RapportCaisse,
  type ReceptionsTardives,
  type TotauxCaisse,
} from '@/domain/caisse';
import type { AuthAgent } from '@/modules/auth/types';

const SELECT_AGENT = {
  id: true,
  nom: true,
  role: true,
  actif: true,
  deletedAt: true,
} satisfies Prisma.AgentSelect;

const SELECT_MEMBRE = {
  contrat: {
    select: {
      membre: {
        select: {
          id: true,
          nom: true,
          prenoms: true,
          numeroMembre: true,
          codeMembre: true,
        },
      },
    },
  },
} satisfies Prisma.VersementSelect;

/** Une seule photo de la base pour toutes les lectures d'un rapport. */
const INSTANTANE = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
};

interface AgentLu {
  id: string;
  nom: string;
  role: RoleAgent;
  actif: boolean;
  deletedAt: Date | null;
}

type Membre = Prisma.MembreGetPayload<{
  select: (typeof SELECT_MEMBRE)['contrat']['select']['membre']['select'];
}>;
type VersementLu = Prisma.VersementGetPayload<{
  include: typeof SELECT_MEMBRE;
}>;
type AvanceLue = Prisma.AvanceGetPayload<{ include: typeof SELECT_MEMBRE }>;
type RetraitLu = Prisma.RetraitGetPayload<{ include: typeof SELECT_MEMBRE }>;

/** Ligne du domaine, plus ce que la réponse affiche en plus du montant. */
interface LigneDetaillee extends LigneCaisse {
  sortie: {
    receiptNumber: string | null;
    montant: bigint;
    contratId: string;
    membre: Membre;
    [champ: string]: unknown;
  };
}

/** Filtres de date des deux lectures : mouvements du jour, réceptions tardives. */
function filtresJour(debut: Date, fin: Date) {
  const recusPendantD = { createdAt: { gte: debut, lt: fin } };
  return {
    versementsDuJour: { paidAt: { gte: debut, lt: fin } },
    avancesDuJour: { dateAvance: { gte: debut, lt: fin } },
    retraitsDuJour: { dateRetrait: { gte: debut, lt: fin } },
    versementsTardifs: { ...recusPendantD, paidAt: { lt: debut } },
    avancesTardives: { ...recusPendantD, dateAvance: { lt: debut } },
    retraitsTardifs: { ...recusPendantD, dateRetrait: { lt: debut } },
  };
}

@Injectable()
export class CaisseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  private estGlobal(agent: AuthAgent): boolean {
    return agent.role === 'SUPERVISEUR' || agent.role === 'ADMIN';
  }

  /** Jour demandé, ou aujourd'hui au Bénin ; un jour futur est refusé. */
  private resoudreJour(date?: string): string {
    const aujourdhui = jourBenin(this.clock.now());
    if (date === undefined) return aujourdhui;
    if (date > aujourdhui) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Date future : pas de rapport après le ${aujourdhui}.`,
      });
    }
    return date;
  }

  /** Rapport détaillé d'un compte pour un jour (spec 0002, AC-1 à AC-9, AC-13 à AC-18). */
  async rapportAgent(acteur: AuthAgent, agentId: string, date?: string) {
    const jour = this.resoudreJour(date);
    if (!this.estGlobal(acteur) && acteur.id !== agentId) {
      throw new NotFoundException('Agent introuvable');
    }
    const { debut, fin } = bornesJour(jour);
    const f = filtresJour(debut, fin);
    const genereA = this.clock.now();

    const [agent, versements, avances, retraits, vTard, aTard, rTard] =
      await this.prisma.$transaction(
        [
          this.prisma.agent.findUnique({
            where: { id: agentId },
            select: SELECT_AGENT,
          }),
          this.prisma.versement.findMany({
            where: { agentId, ...f.versementsDuJour },
            include: SELECT_MEMBRE,
          }),
          this.prisma.avance.findMany({
            where: { agentId, ...f.avancesDuJour },
            include: SELECT_MEMBRE,
          }),
          this.prisma.retrait.findMany({
            where: { agentId, ...f.retraitsDuJour },
            include: SELECT_MEMBRE,
          }),
          this.prisma.versement.findMany({
            where: { agentId, ...f.versementsTardifs },
            include: SELECT_MEMBRE,
          }),
          this.prisma.avance.findMany({
            where: { agentId, ...f.avancesTardives },
            include: SELECT_MEMBRE,
          }),
          this.prisma.retrait.findMany({
            where: { agentId, ...f.retraitsTardifs },
            include: SELECT_MEMBRE,
          }),
        ],
        INSTANTANE,
      );
    if (!agent) throw new NotFoundException('Agent introuvable');

    const lignes = this.lignesDetaillees(versements, avances, retraits);
    const tardives = this.lignesDetaillees(vTard, aTard, rTard);

    return {
      agent: this.versAgent(agent),
      date: jour,
      fuseau: FUSEAU_CAISSE,
      genereA,
      ...this.versRapport(calculerRapportCaisse(lignes, fin)),
      lignes: lignes.map((l) => this.sortieLigne(l, fin)),
      receptionsTardives: {
        ...this.versReceptions(regrouperReceptionsTardives(tardives, debut)),
        lignes: tardives.map((l) => {
          const jourTerrain = jourBenin(l.dateTerrain);
          return {
            ...this.sortieLigne(l, bornesJour(jourTerrain).fin),
            jourTerrain,
          };
        }),
      },
    };
  }

  /** Synthèse de tous les comptes pour un jour (spec 0002, AC-10, AC-16). */
  async synthese(date?: string) {
    const jour = this.resoudreJour(date);
    const { debut, fin } = bornesJour(jour);
    const f = filtresJour(debut, fin);
    const genereA = this.clock.now();
    const select = { id: true, agentId: true, createdAt: true } as const;
    const versement = { ...select, amount: true, paidAt: true } as const;
    const avance = { ...select, montant: true, dateAvance: true } as const;
    const retrait = { ...select, montantNet: true, dateRetrait: true } as const;

    const [agents, versements, avances, retraits, vTard, aTard, rTard] =
      await this.prisma.$transaction(
        [
          this.prisma.agent.findMany({
            where: {
              OR: [
                { role: 'AGENT', actif: true, deletedAt: null },
                { versements: { some: f.versementsDuJour } },
                { avances: { some: f.avancesDuJour } },
                { retraits: { some: f.retraitsDuJour } },
                { versements: { some: f.versementsTardifs } },
                { avances: { some: f.avancesTardives } },
                { retraits: { some: f.retraitsTardifs } },
              ],
            },
            select: SELECT_AGENT,
          }),
          this.prisma.versement.findMany({
            where: f.versementsDuJour,
            select: versement,
          }),
          this.prisma.avance.findMany({
            where: f.avancesDuJour,
            select: avance,
          }),
          this.prisma.retrait.findMany({
            where: f.retraitsDuJour,
            select: retrait,
          }),
          this.prisma.versement.findMany({
            where: f.versementsTardifs,
            select: versement,
          }),
          this.prisma.avance.findMany({
            where: f.avancesTardives,
            select: avance,
          }),
          this.prisma.retrait.findMany({
            where: f.retraitsTardifs,
            select: retrait,
          }),
        ],
        INSTANTANE,
      );

    const duJour = this.lignesParAgent(versements, avances, retraits);
    const tardives = this.lignesParAgent(vTard, aTard, rTard);

    const lignesAgents = [...agents]
      .sort(
        (a, b) => a.nom.localeCompare(b.nom, 'fr') || (a.id < b.id ? -1 : 1),
      )
      .map((agent) => ({
        agent: this.versAgent(agent),
        ...this.versRapport(
          calculerRapportCaisse(duJour.get(agent.id) ?? [], fin),
        ),
        receptionsTardives: this.versReceptionsSynthese(
          regrouperReceptionsTardives(tardives.get(agent.id) ?? [], debut),
        ),
      }));

    return {
      date: jour,
      fuseau: FUSEAU_CAISSE,
      genereA,
      ...this.versRapport(
        calculerRapportCaisse([...duJour.values()].flat(), fin),
      ),
      receptionsTardives: this.versReceptionsSynthese(
        regrouperReceptionsTardives([...tardives.values()].flat(), debut),
      ),
      agents: lignesAgents,
    };
  }

  /** Lignes triées du détail, avec ce que la réponse affiche pour chacune. */
  private lignesDetaillees(
    versements: VersementLu[],
    avances: AvanceLue[],
    retraits: RetraitLu[],
  ): LigneDetaillee[] {
    return trierLignes<LigneDetaillee>([
      ...versements.map((v) => ({
        id: v.id,
        type: 'VERSEMENT' as const,
        montant: Number(v.amount),
        dateTerrain: v.paidAt,
        recuServeurA: v.createdAt,
        sortie: {
          receiptNumber: v.receiptNumber,
          ecartHorlogeS: v.ecartHorlogeS,
          montant: v.amount,
          contratId: v.contratId,
          membre: v.contrat.membre,
          misesCount: v.misesCount,
        },
      })),
      ...avances.map((a) => ({
        id: a.id,
        type: 'AVANCE' as const,
        montant: Number(a.montant),
        dateTerrain: a.dateAvance,
        recuServeurA: a.createdAt,
        sortie: {
          receiptNumber: a.receiptNumber,
          ecartHorlogeS: a.ecartHorlogeS,
          montant: a.montant,
          contratId: a.contratId,
          membre: a.contrat.membre,
        },
      })),
      ...retraits.map((r) => ({
        id: r.id,
        type: 'RETRAIT' as const,
        montant: Number(r.montantNet),
        dateTerrain: r.dateRetrait,
        recuServeurA: r.createdAt,
        sortie: {
          receiptNumber: r.receiptNumber,
          ecartHorlogeS: r.ecartHorlogeS,
          montant: r.montantNet,
          contratId: r.contratId,
          membre: r.contrat.membre,
          typeRetrait: r.type,
          montantBrut: r.montantBrut,
          commissionPrelevee: r.commissionPrelevee,
          interetDu: r.interetDu,
        },
      })),
    ]);
  }

  /** Une ligne telle que la réponse l'affiche ; `fin` est celle de son jour terrain. */
  private sortieLigne(ligne: LigneDetaillee, fin: Date) {
    const { id, type, dateTerrain, recuServeurA, sortie } = ligne;
    const { membre, ...reste } = sortie;
    return {
      type,
      id,
      dateTerrain,
      recuServeurA,
      arriveeTardive: estArriveeTardive(recuServeurA, fin),
      ...reste,
      membre,
    };
  }

  /** Lignes de la synthèse (colonnes minimales), groupées par agent. */
  private lignesParAgent(
    versements: {
      id: string;
      agentId: string;
      createdAt: Date;
      amount: bigint;
      paidAt: Date;
    }[],
    avances: {
      id: string;
      agentId: string;
      createdAt: Date;
      montant: bigint;
      dateAvance: Date;
    }[],
    retraits: {
      id: string;
      agentId: string;
      createdAt: Date;
      montantNet: bigint;
      dateRetrait: Date;
    }[],
  ): Map<string, LigneCaisse[]> {
    const parAgent = new Map<string, LigneCaisse[]>();
    const ajouter = (agentId: string, ligne: LigneCaisse) => {
      parAgent.set(agentId, [...(parAgent.get(agentId) ?? []), ligne]);
    };
    for (const v of versements) {
      ajouter(v.agentId, {
        id: v.id,
        type: 'VERSEMENT',
        montant: Number(v.amount),
        dateTerrain: v.paidAt,
        recuServeurA: v.createdAt,
      });
    }
    for (const a of avances) {
      ajouter(a.agentId, {
        id: a.id,
        type: 'AVANCE',
        montant: Number(a.montant),
        dateTerrain: a.dateAvance,
        recuServeurA: a.createdAt,
      });
    }
    for (const r of retraits) {
      ajouter(r.agentId, {
        id: r.id,
        type: 'RETRAIT',
        montant: Number(r.montantNet),
        dateTerrain: r.dateRetrait,
        recuServeurA: r.createdAt,
      });
    }
    return parAgent;
  }

  private versAgent(agent: AgentLu) {
    return {
      id: agent.id,
      nom: agent.nom,
      role: agent.role,
      actif: agent.actif,
      supprime: agent.deletedAt !== null,
    };
  }

  /** Repasse les montants du domaine (`number`) en `BigInt`, sérialisés en chaînes. */
  private versRapport(rapport: RapportCaisse) {
    const t: TotauxCaisse = rapport.totaux;
    return {
      totaux: {
        encaisse: BigInt(t.encaisse),
        avances: BigInt(t.avances),
        retraitsNets: BigInt(t.retraitsNets),
        decaisse: BigInt(t.decaisse),
        soldeAttendu: BigInt(t.soldeAttendu),
        nbMouvements: t.nbMouvements,
      },
      soldeNegatif: rapport.soldeNegatif,
      arriveesTardives: rapport.arriveesTardives,
    };
  }

  private versReceptionsSynthese(r: ReceptionsTardives) {
    return { nbMouvements: r.nbMouvements, effetSolde: BigInt(r.effetSolde) };
  }

  private versReceptions(r: ReceptionsTardives) {
    return {
      ...this.versReceptionsSynthese(r),
      parJour: r.parJour.map((j) => ({
        date: j.date,
        nbMouvements: j.nbMouvements,
        encaisse: BigInt(j.encaisse),
        avances: BigInt(j.avances),
        retraitsNets: BigInt(j.retraitsNets),
        decaisse: BigInt(j.decaisse),
        effetSolde: BigInt(j.effetSolde),
      })),
    };
  }
}
