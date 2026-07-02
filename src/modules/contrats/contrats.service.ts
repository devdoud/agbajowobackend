import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ClockService } from '@/common/clock/clock.service';
import { commissionDue } from '@/domain/commission';
import { statutCollecte } from '@/domain/statut';
import { dateEcheance, parametresGroupe } from '@/domain/parametres-groupe';
import type { AuthAgent } from '@/modules/auth/types';
import type { SouscrireContratDto } from './dto/souscrire-contrat.dto';

@Injectable()
export class ContratsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  private estGlobal(agent: AuthAgent): boolean {
    return agent.role === 'SUPERVISEUR' || agent.role === 'ADMIN';
  }

  private filtreProprietaire(agent: AuthAgent): Prisma.ContratWhereInput {
    return this.estGlobal(agent) ? {} : { ownerId: agent.id };
  }

  async souscrire(agent: AuthAgent, dto: SouscrireContratDto) {
    const membre = await this.prisma.membre.findFirst({
      where: {
        id: dto.membreId,
        deletedAt: null,
        ...(this.estGlobal(agent) ? {} : { ownerId: agent.id }),
      },
    });
    if (!membre) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Membre introuvable ou hors de votre portefeuille.',
      });
    }

    const p = parametresGroupe(dto.groupe);
    return this.prisma.contrat.create({
      data: {
        id: dto.id ?? randomUUID(),
        membreId: membre.id,
        ownerId: agent.id,
        groupe: dto.groupe,
        cadence: p.cadence,
        intervalleJours: p.intervalleJours,
        moisParCycle: p.moisParCycle,
        misesParMois: p.misesParMois,
        targetMises: p.targetMises,
        miseAmount: BigInt(dto.miseAmount),
        commissionParMois: p.commissionParMois,
        commissionParCycle: p.commissionParCycle,
        creditAutorise: p.creditAutorise,
        maxAvances: p.maxAvances,
        startDate: dto.startDate,
        endDate: dateEcheance(dto.startDate, p),
      },
    });
  }

  async detail(agent: AuthAgent, id: string) {
    const contrat = await this.prisma.contrat.findFirst({
      where: { id, deletedAt: null, ...this.filtreProprietaire(agent) },
      include: { membre: true },
    });
    if (!contrat) throw new NotFoundException('Contrat introuvable');

    const [versements, avances] = await Promise.all([
      this.prisma.versement.findMany({ where: { contratId: id } }),
      this.prisma.avance.findMany({ where: { contratId: id } }),
    ]);

    const misesVersees = versements.reduce((s, v) => s + v.misesCount, 0);
    const soldeBrut = versements.reduce((s, v) => s + Number(v.amount), 0);
    const interetDu = avances.reduce((s, a) => s + Number(a.interet), 0);
    // Remboursement des avances géré au lot L7 : ici l'avance reste due en entier.
    const avanceRestante = avances.reduce((s, a) => s + Number(a.montant), 0);
    const miseAmount = Number(contrat.miseAmount);

    const commission = commissionDue(
      {
        misesParMois: contrat.misesParMois,
        moisParCycle: contrat.moisParCycle,
        miseAmount,
        commissionParMois: contrat.commissionParMois,
        commissionParCycle: contrat.commissionParCycle,
      },
      misesVersees,
    );

    const statut = statutCollecte(
      {
        cadence: contrat.cadence,
        intervalleJours: contrat.intervalleJours,
        startDate: contrat.startDate,
        misesVersees,
        targetMises: contrat.targetMises,
        termine:
          contrat.statut === 'TERMINE' ||
          contrat.statut === 'CLOTURE_ANTICIPEE',
      },
      this.clock.now(),
    );

    return {
      ...contrat,
      miseAmount,
      derive: {
        misesVersees,
        soldeBrut,
        commissionDue: commission,
        interetDu,
        avanceRestante,
        soldeNet: soldeBrut - commission - interetDu - avanceRestante,
        progression:
          contrat.targetMises > 0
            ? Math.min(
                100,
                Math.round((misesVersees / contrat.targetMises) * 100),
              )
            : 0,
        statutCollecte: statut,
      },
    };
  }

  async historiqueVersements(
    agent: AuthAgent,
    id: string,
    limit: number,
    cursor?: bigint,
  ) {
    const contrat = await this.prisma.contrat.findFirst({
      where: { id, deletedAt: null, ...this.filtreProprietaire(agent) },
      select: { id: true },
    });
    if (!contrat) throw new NotFoundException('Contrat introuvable');

    const where: Prisma.VersementWhereInput = { contratId: id };
    if (cursor !== undefined) where.serverSeq = { gt: cursor };

    const rows = await this.prisma.versement.findMany({
      where,
      orderBy: { serverSeq: 'asc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? data[data.length - 1].serverSeq.toString()
      : null;
    return { data, nextCursor, hasMore };
  }
}
