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
  trierLignes,
  type LigneCaisse,
  type RapportCaisse,
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

  /** Rapport détaillé d'un compte pour un jour (spec 0002, AC-1 à AC-9). */
  async rapportAgent(acteur: AuthAgent, agentId: string, date?: string) {
    const jour = this.resoudreJour(date);
    if (!this.estGlobal(acteur) && acteur.id !== agentId) {
      throw new NotFoundException('Agent introuvable');
    }
    const { debut, fin } = bornesJour(jour);
    const genereA = this.clock.now();

    const [agent, versements, avances, retraits] =
      await this.prisma.$transaction(
        [
          this.prisma.agent.findUnique({
            where: { id: agentId },
            select: SELECT_AGENT,
          }),
          this.prisma.versement.findMany({
            where: { agentId, paidAt: { gte: debut, lt: fin } },
            include: SELECT_MEMBRE,
          }),
          this.prisma.avance.findMany({
            where: { agentId, dateAvance: { gte: debut, lt: fin } },
            include: SELECT_MEMBRE,
          }),
          this.prisma.retrait.findMany({
            where: { agentId, dateRetrait: { gte: debut, lt: fin } },
            include: SELECT_MEMBRE,
          }),
        ],
        INSTANTANE,
      );
    if (!agent) throw new NotFoundException('Agent introuvable');

    const lignes = trierLignes([
      ...versements.map((v) => ({
        id: v.id,
        type: 'VERSEMENT' as const,
        montant: Number(v.amount),
        dateTerrain: v.paidAt,
        recuServeurA: v.createdAt,
        sortie: {
          receiptNumber: v.receiptNumber,
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

    return {
      agent: this.versAgent(agent),
      date: jour,
      fuseau: FUSEAU_CAISSE,
      genereA,
      ...this.versRapport(calculerRapportCaisse(lignes, fin)),
      lignes: lignes.map(({ id, type, dateTerrain, recuServeurA, sortie }) => {
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
      }),
    };
  }

  /** Synthèse de tous les comptes pour un jour (spec 0002, AC-10). */
  async synthese(date?: string) {
    const jour = this.resoudreJour(date);
    const { debut, fin } = bornesJour(jour);
    const genereA = this.clock.now();
    const select = { id: true, agentId: true, createdAt: true } as const;

    const [agents, versements, avances, retraits] =
      await this.prisma.$transaction(
        [
          this.prisma.agent.findMany({
            where: {
              OR: [
                { role: 'AGENT', actif: true, deletedAt: null },
                { versements: { some: { paidAt: { gte: debut, lt: fin } } } },
                { avances: { some: { dateAvance: { gte: debut, lt: fin } } } },
                {
                  retraits: { some: { dateRetrait: { gte: debut, lt: fin } } },
                },
              ],
            },
            select: SELECT_AGENT,
          }),
          this.prisma.versement.findMany({
            where: { paidAt: { gte: debut, lt: fin } },
            select: { ...select, amount: true, paidAt: true },
          }),
          this.prisma.avance.findMany({
            where: { dateAvance: { gte: debut, lt: fin } },
            select: { ...select, montant: true, dateAvance: true },
          }),
          this.prisma.retrait.findMany({
            where: { dateRetrait: { gte: debut, lt: fin } },
            select: { ...select, montantNet: true, dateRetrait: true },
          }),
        ],
        INSTANTANE,
      );

    const parAgent = new Map<string, LigneCaisse[]>();
    const ajouter = (agentId: string, ligne: LigneCaisse) => {
      const lignes = parAgent.get(agentId) ?? [];
      lignes.push(ligne);
      parAgent.set(agentId, lignes);
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

    const lignesAgents = [...agents]
      .sort(
        (a, b) => a.nom.localeCompare(b.nom, 'fr') || (a.id < b.id ? -1 : 1),
      )
      .map((agent) => ({
        agent: this.versAgent(agent),
        ...this.versRapport(
          calculerRapportCaisse(parAgent.get(agent.id) ?? [], fin),
        ),
      }));

    return {
      date: jour,
      fuseau: FUSEAU_CAISSE,
      genereA,
      ...this.versRapport(
        calculerRapportCaisse([...parAgent.values()].flat(), fin),
      ),
      agents: lignesAgents,
    };
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
}
