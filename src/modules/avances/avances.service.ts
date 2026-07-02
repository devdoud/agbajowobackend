import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { prochainRecu } from '@/common/receipt';
import {
  interetAvance,
  montantAttenduMensuel,
  validerAvance,
} from '@/domain/credit';
import type { AuthAgent } from '@/modules/auth/types';
import type { AccorderAvanceDto } from './dto/accorder-avance.dto';

@Injectable()
export class AvancesService {
  constructor(private readonly prisma: PrismaService) {}

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
            dateAvance: dto.dateAvance ?? new Date(),
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
