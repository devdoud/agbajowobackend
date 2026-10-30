import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { prochainRecu } from '@/common/receipt';
import { verrouillerContrat } from '@/common/verrou-contrat';
import { ClockService } from '@/common/clock/clock.service';
import { verifierBornesDateTerrain } from '@/domain/date-terrain';
import {
  interetAvance,
  montantAttenduMensuel,
  validerAvance,
} from '@/domain/credit';
import type { AuthAgent } from '@/modules/auth/types';
import type { AccorderAvanceDto } from './dto/accorder-avance.dto';

@Injectable()
export class AvancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  private estGlobal(agent: AuthAgent): boolean {
    return agent.role === 'SUPERVISEUR' || agent.role === 'ADMIN';
  }

  async accorder(agent: AuthAgent, dto: AccorderAvanceDto) {
    const id = dto.id ?? randomUUID();

    const existant = await this.prisma.avance.findUnique({
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
        const dejaEnregistre = await tx.avance.findUnique({
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
            message: 'Contrat non actif : avance impossible.',
          });
        }

        // Date terrain plausible (spec 0003) : elle range l'argent dans un jour.
        const dateTerrain = dto.dateAvance ?? maintenant;
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

        const nbAvances = await tx.avance.count({
          where: { contratId: contrat.id },
        });
        const miseAmount = Number(contrat.miseAmount);

        const validation = validerAvance({
          creditAutorise: contrat.creditAutorise,
          avancesExistantes: nbAvances,
          maxAvances: contrat.maxAvances,
          misesParMois: contrat.misesParMois,
          miseAmount,
          nbMois: dto.nbMois,
          montant: dto.montant,
        });
        if (!validation.ok) {
          throw new UnprocessableEntityException({
            code: 'BUSINESS_RULE',
            message: validation.raison,
          });
        }

        return tx.avance.create({
          data: {
            id,
            contratId: contrat.id,
            agentId: agent.id,
            rang: nbAvances + 1,
            nbMois: dto.nbMois,
            montant: BigInt(dto.montant),
            montantAttenduRef: BigInt(
              montantAttenduMensuel(contrat.misesParMois, miseAmount),
            ),
            interet: BigInt(interetAvance(miseAmount, dto.nbMois)),
            dateAvance: dateTerrain,
            receiptNumber: await prochainRecu(tx),
            idempotencyKey: id,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.avance.findUnique({
          where: { idempotencyKey: id },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }
}
