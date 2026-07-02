import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ClockService } from '@/common/clock/clock.service';
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
