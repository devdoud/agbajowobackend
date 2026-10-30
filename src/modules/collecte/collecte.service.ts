import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { plageMises } from '@/domain/mises';
import { prochainRecu } from '@/common/receipt';
import { verrouillerContrat } from '@/common/verrou-contrat';
import { ClockService } from '@/common/clock/clock.service';
import { verifierBornesDateTerrain } from '@/domain/date-terrain';
import type { AuthAgent } from '@/modules/auth/types';
import type { EncaisserDto } from './dto/encaisser.dto';

@Injectable()
export class CollecteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  private estGlobal(agent: AuthAgent): boolean {
    return agent.role === 'SUPERVISEUR' || agent.role === 'ADMIN';
  }

  /**
   * Encaisse un versement de `misesCount` mises. Idempotent (par idempotencyKey),
   * transactionnel : calcule les numéros de mises, attribue le reçu, et clôt le
   * contrat (TERMINE) si l'objectif est atteint.
   */
  async encaisser(
    agent: AuthAgent,
    dto: EncaisserDto,
    // Écart d'horloge corrigé par la synchro (spec 0005), gardé sur le mouvement.
    { ecartHorlogeS }: { ecartHorlogeS?: number } = {},
  ) {
    const id = dto.id ?? randomUUID();

    const existant = await this.prisma.versement.findUnique({
      where: { idempotencyKey: id },
    });
    if (existant) return existant;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await verrouillerContrat(tx, dto.contratId);
        // Lue après l'attente du verrou : c'est l'heure de l'écriture réelle.
        const maintenant = this.clock.now();
        // Une relance du même id a pu attendre le verrou pendant que l'original
        // s'enregistrait : on la rejoue avant d'appliquer les règles métier.
        const dejaEnregistre = await tx.versement.findUnique({
          where: { idempotencyKey: id },
        });
        if (dejaEnregistre) return dejaEnregistre;
        const contrat = await tx.contrat.findFirst({
          where: {
            id: dto.contratId,
            deletedAt: null,
            ...(this.estGlobal(agent) ? {} : { ownerId: agent.id }),
          },
        });
        if (!contrat) throw new NotFoundException('Contrat introuvable');
        if (contrat.statut !== 'ACTIF') {
          throw new UnprocessableEntityException({
            code: 'BUSINESS_RULE',
            message: 'Contrat non actif : encaissement impossible.',
          });
        }

        // Date terrain plausible (spec 0003) : elle range l'argent dans un jour.
        const dateTerrain = dto.paidAt ?? maintenant;
        const bornes = verifierBornesDateTerrain(
          dateTerrain,
          maintenant,
          contrat.startDate,
        );
        if (!bornes.ok) {
          throw new UnprocessableEntityException({
            code: 'BUSINESS_RULE',
            message: bornes.raison,
          });
        }

        const agg = await tx.versement.aggregate({
          where: { contratId: contrat.id },
          _sum: { misesCount: true },
        });
        const cumul = agg._sum.misesCount ?? 0;
        if (cumul + dto.misesCount > contrat.targetMises) {
          throw new UnprocessableEntityException({
            code: 'BUSINESS_RULE',
            message: `Dépasse l'objectif du livret (${contrat.targetMises} mises).`,
          });
        }

        const plage = plageMises(cumul, dto.misesCount);
        const versement = await tx.versement.create({
          data: {
            id,
            contratId: contrat.id,
            agentId: agent.id,
            misesCount: dto.misesCount,
            amount: BigInt(dto.misesCount) * contrat.miseAmount,
            paidAt: dateTerrain,
            numeroMiseDebut: plage.debut,
            numeroMiseFin: plage.fin,
            receiptNumber: await prochainRecu(tx, maintenant),
            idempotencyKey: id,
            ecartHorlogeS: ecartHorlogeS ?? null,
          },
        });

        if (cumul + dto.misesCount >= contrat.targetMises) {
          await tx.contrat.update({
            where: { id: contrat.id },
            data: { statut: 'TERMINE' },
          });
        }
        return versement;
      });
    } catch (error) {
      // Course concurrente sur l'idempotencyKey : on renvoie l'existant.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.versement.findUnique({
          where: { idempotencyKey: id },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }
}
