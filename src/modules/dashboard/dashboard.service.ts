import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ClockService } from '@/common/clock/clock.service';
import {
  DECALAGE_BENIN_MINUTES,
  FUSEAU_CAISSE,
  bornesJour,
  jourBenin,
  joursDeLaSerie,
  remplirSerie,
  type PointSerie,
} from '@/domain/caisse';
import { commissionDue } from '@/domain/commission';
import { statutCollecte } from '@/domain/statut';
import { ajouterJours, debutDeJour } from '@/domain/dates';
import type { StatutCollecte } from '@/domain/types';
import type { AuthAgent } from '@/modules/auth/types';

export type Periode = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

const ORDRE_PRIORITE: Record<StatutCollecte, number> = {
  en_retard: 0,
  a_collecter: 1,
  paye: 2,
  termine: 3,
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  private estGlobal(agent: AuthAgent): boolean {
    return agent.role === 'SUPERVISEUR' || agent.role === 'ADMIN';
  }

  private finDeJour(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private plagePeriode(
    periode: Periode,
    now: Date,
    dateStr?: string,
  ): { start: Date; end: Date } {
    if (periode === 'yesterday') {
      const y = ajouterJours(now, -1);
      return { start: debutDeJour(y), end: this.finDeJour(y) };
    }
    if (periode === 'week') {
      const start = debutDeJour(ajouterJours(now, -((now.getDay() + 6) % 7)));
      return { start, end: this.finDeJour(now) };
    }
    if (periode === 'month') {
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: this.finDeJour(now),
      };
    }
    if (periode === 'custom' && dateStr) {
      const d = new Date(`${dateStr}T00:00:00`);
      return { start: debutDeJour(d), end: this.finDeJour(d) };
    }
    return { start: debutDeJour(now), end: this.finDeJour(now) };
  }

  private dateReference(now: Date, periode: Periode, dateStr?: string): Date {
    return periode === 'custom' && dateStr
      ? new Date(`${dateStr}T00:00:00`)
      : now;
  }

  /**
   * Courbe par jour du Bénin (spec 0005) : encaissé, avances et retraits nets, rangés
   * par date terrain comme le rapport de caisse, agrégés en base (pas de téléchargement
   * de toute la base côté client). Portée : comme la caisse, par agent qui a manié l'argent.
   */
  async serie(agent: AuthAgent, jours: number, agentId?: string) {
    let cible: string | null = null;
    if (!this.estGlobal(agent)) {
      if (agentId !== undefined && agentId !== agent.id) {
        throw new NotFoundException('Agent introuvable');
      }
      cible = agent.id;
    } else if (agentId !== undefined) {
      const existe = await this.prisma.agent.findUnique({
        where: { id: agentId },
        select: { id: true },
      });
      if (!existe) throw new NotFoundException('Agent introuvable');
      cible = agentId;
    }

    const liste = joursDeLaSerie(jourBenin(this.clock.now()), jours);
    const debut = bornesJour(liste[0]).debut;
    const fin = bornesJour(liste[liste.length - 1]).fin;
    const filtreAgent = cible
      ? Prisma.sql`AND agent_id = ${cible}::uuid`
      : Prisma.empty;
    // Même découpage que `jourBenin` : décalage fixe, sans heure d'été.
    const jour = (colonne: Prisma.Sql) =>
      Prisma.sql`to_char((${colonne} AT TIME ZONE 'UTC') + make_interval(mins => ${DECALAGE_BENIN_MINUTES}::int), 'YYYY-MM-DD')`;

    const [versements, avances, retraits] = await Promise.all([
      this.prisma.$queryRaw<{ jour: string; total: bigint; nb: number }[]>`
        SELECT ${jour(Prisma.sql`paid_at`)} AS jour, SUM(amount)::bigint AS total, COUNT(*)::int AS nb
        FROM versements
        WHERE paid_at >= ${debut} AND paid_at < ${fin} ${filtreAgent}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ jour: string; total: bigint }[]>`
        SELECT ${jour(Prisma.sql`date_avance`)} AS jour, SUM(montant)::bigint AS total
        FROM avances
        WHERE date_avance >= ${debut} AND date_avance < ${fin} ${filtreAgent}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ jour: string; total: bigint }[]>`
        SELECT ${jour(Prisma.sql`date_retrait`)} AS jour, SUM(montant_net)::bigint AS total
        FROM retraits
        WHERE date_retrait >= ${debut} AND date_retrait < ${fin} ${filtreAgent}
        GROUP BY 1`,
    ]);

    const sommes: Record<string, Partial<Omit<PointSerie, 'date'>>> = {};
    const point = (j: string) => (sommes[j] ??= {});
    for (const v of versements) {
      point(v.jour).encaisse = Number(v.total);
      point(v.jour).nbVersements = v.nb;
    }
    for (const a of avances) point(a.jour).avances = Number(a.total);
    for (const r of retraits) point(r.jour).retraitsNets = Number(r.total);

    return {
      du: liste[0],
      au: liste[liste.length - 1],
      fuseau: FUSEAU_CAISSE,
      agentId: cible,
      points: remplirSerie(liste, sommes),
    };
  }

  async stats(agent: AuthAgent, periode: Periode, dateStr?: string) {
    const now = this.clock.now();
    const dateRef = this.dateReference(now, periode, dateStr);
    const plage = this.plagePeriode(periode, now, dateStr);
    const scope: Prisma.ContratWhereInput = this.estGlobal(agent)
      ? {}
      : { ownerId: agent.id };

    const contrats = await this.prisma.contrat.findMany({
      where: { deletedAt: null, statut: 'ACTIF', ...scope },
    });
    const ids = contrats.map((c) => c.id);

    const [vGroups, aGroups] = await Promise.all([
      this.prisma.versement.groupBy({
        by: ['contratId'],
        where: { contratId: { in: ids } },
        _sum: { misesCount: true },
      }),
      this.prisma.avance.groupBy({
        by: ['contratId'],
        where: { contratId: { in: ids } },
        _sum: { montant: true },
      }),
    ]);
    const misesParContrat = new Map(
      vGroups.map((g) => [g.contratId, g._sum.misesCount ?? 0]),
    );
    const avanceParContrat = new Map(
      aGroups.map((g) => [g.contratId, Number(g._sum.montant ?? 0n)]),
    );

    let payes = 0;
    let aCollecter = 0;
    let enRetard = 0;
    let attenduJournalier = 0;
    let commissions = 0;
    let avancesEnCours = 0;

    for (const c of contrats) {
      const misesVersees = misesParContrat.get(c.id) ?? 0;
      const miseAmount = Number(c.miseAmount);
      attenduJournalier += miseAmount;
      avancesEnCours += avanceParContrat.get(c.id) ?? 0;
      commissions += commissionDue(
        {
          misesParMois: c.misesParMois,
          moisParCycle: c.moisParCycle,
          miseAmount,
          commissionParMois: c.commissionParMois,
          commissionParCycle: c.commissionParCycle,
        },
        misesVersees,
      );
      const statut = statutCollecte(
        {
          cadence: c.cadence,
          intervalleJours: c.intervalleJours,
          startDate: c.startDate,
          misesVersees,
          targetMises: c.targetMises,
        },
        dateRef,
      );
      if (statut === 'paye') payes += 1;
      else if (statut === 'a_collecter') aCollecter += 1;
      else if (statut === 'en_retard') enRetard += 1;
    }

    const [collecteAgg, nouveauxMembres] = await Promise.all([
      this.prisma.versement.aggregate({
        where: {
          paidAt: { gte: plage.start, lte: plage.end },
          ...(this.estGlobal(agent) ? {} : { agentId: agent.id }),
        },
        _sum: { amount: true },
      }),
      this.prisma.membre.count({
        where: {
          deletedAt: null,
          createdAt: { gte: plage.start, lte: plage.end },
          ...(this.estGlobal(agent) ? {} : { ownerId: agent.id }),
        },
      }),
    ]);

    return {
      periode,
      collecte: Number(collecteAgg._sum.amount ?? 0n),
      attenduJournalier,
      contratsActifs: contrats.length,
      payes,
      aCollecter,
      enRetard,
      nouveauxMembres,
      commissions,
      avancesEnCours,
    };
  }

  async file(
    agent: AuthAgent,
    periode: Periode,
    statutFiltre?: StatutCollecte,
    q?: string,
    dateStr?: string,
  ) {
    const now = this.clock.now();
    const dateRef = this.dateReference(now, periode, dateStr);
    const scope: Prisma.ContratWhereInput = this.estGlobal(agent)
      ? {}
      : { ownerId: agent.id };

    const where: Prisma.ContratWhereInput = {
      deletedAt: null,
      statut: 'ACTIF',
      ...scope,
    };
    if (q) {
      where.membre = {
        OR: [
          { nom: { contains: q, mode: 'insensitive' } },
          { prenoms: { contains: q, mode: 'insensitive' } },
          { numeroMembre: { contains: q, mode: 'insensitive' } },
          { telephone: { contains: q } },
        ],
      };
    }

    const contrats = await this.prisma.contrat.findMany({
      where,
      include: { membre: true },
    });
    const ids = contrats.map((c) => c.id);
    const vGroups = await this.prisma.versement.groupBy({
      by: ['contratId'],
      where: { contratId: { in: ids } },
      _sum: { misesCount: true, amount: true },
    });
    const parContrat = new Map(vGroups.map((g) => [g.contratId, g._sum]));

    const lignes = contrats.map((c) => {
      const sums = parContrat.get(c.id);
      const misesVersees = sums?.misesCount ?? 0;
      const statut = statutCollecte(
        {
          cadence: c.cadence,
          intervalleJours: c.intervalleJours,
          startDate: c.startDate,
          misesVersees,
          targetMises: c.targetMises,
        },
        dateRef,
      );
      return {
        contratId: c.id,
        groupe: c.groupe,
        miseAmount: Number(c.miseAmount),
        membre: {
          id: c.membre.id,
          numeroMembre: c.membre.numeroMembre,
          nom: c.membre.nom,
          prenoms: c.membre.prenoms,
          telephone: c.membre.telephone,
          quartier: c.membre.quartier,
        },
        misesVersees,
        soldeBrut: Number(sums?.amount ?? 0n),
        statutCollecte: statut,
      };
    });

    const filtrees = statutFiltre
      ? lignes.filter((l) => l.statutCollecte === statutFiltre)
      : lignes;

    filtrees.sort(
      (a, b) =>
        ORDRE_PRIORITE[a.statutCollecte] - ORDRE_PRIORITE[b.statutCollecte],
    );

    return { data: filtrees, total: filtrees.length };
  }
}
