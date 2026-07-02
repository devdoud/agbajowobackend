import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { prochainRecu } from '@/common/receipt';
import { commissionDue } from '@/domain/commission';
import { calculRetraitNet } from '@/domain/retrait';
import type { AuthAgent } from '@/modules/auth/types';
import type { EffectuerRetraitDto } from './dto/effectuer-retrait.dto';

@Injectable()
export class RetraitsService {
  constructor(private readonly prisma: PrismaService) {}

  private estGlobal(agent: AuthAgent): boolean {
    return agent.role === 'SUPERVISEUR' || agent.role === 'ADMIN';
  }

  /**
   * Effectue un retrait.
   *  - TOTAL : clôture anticipée ; le membre reçoit le solde net de la commission
   *    due, de l'intérêt dû et de l'avance restante (domaine calculRetraitNet).
   *  - PARTIEL : retire un montant du solde disponible ; la commission/intérêt sont
   *    réglés à la clôture (imputation des périodes = Q29, à préciser).
   */
  async effectuer(agent: AuthAgent, dto: EffectuerRetraitDto) {
    const id = dto.id ?? randomUUID();

    const existant = await this.prisma.retrait.findUnique({
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
            message: 'Contrat non actif : retrait impossible.',
          });
        }

        const [vAgg, avances, rAgg] = await Promise.all([
          tx.versement.aggregate({
            where: { contratId: contrat.id },
            _sum: { amount: true, misesCount: true },
          }),
          tx.avance.findMany({ where: { contratId: contrat.id } }),
          tx.retrait.aggregate({
            where: { contratId: contrat.id },
            _sum: { montantBrut: true },
          }),
        ]);

        const soldeBrut = Number(vAgg._sum.amount ?? 0n);
        const misesVersees = vAgg._sum.misesCount ?? 0;
        const dejaRetire = Number(rAgg._sum.montantBrut ?? 0n);
        const soldeDisponible = soldeBrut - dejaRetire;
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
        const interetDu = avances.reduce((s, a) => s + Number(a.interet), 0);
        const avanceRestante = avances.reduce(
          (s, a) => s + Number(a.montant),
          0,
        );

        let montantBrut: number;
        let montantNet: number;
        let commissionPrelevee: number;
        let interetPreleve: number;

        if (dto.type === 'TOTAL') {
          montantBrut = soldeDisponible;
          const res = calculRetraitNet({
            soldeBrut: soldeDisponible,
            commissionDue: commission,
            interetDu,
            avanceRestante,
          });
          montantNet = res.montantNet;
          commissionPrelevee = commission;
          interetPreleve = interetDu;
        } else {
          const montant = dto.montant ?? 0;
          if (montant > soldeDisponible) {
            throw new UnprocessableEntityException({
              code: 'BUSINESS_RULE',
              message: `Montant supérieur au solde disponible (${soldeDisponible} FCFA).`,
            });
          }
          montantBrut = montant;
          montantNet = montant;
          commissionPrelevee = 0;
          interetPreleve = 0;
        }

        const retrait = await tx.retrait.create({
          data: {
            id,
            contratId: contrat.id,
            agentId: agent.id,
            type: dto.type,
            montantBrut: BigInt(montantBrut),
            commissionPrelevee: BigInt(commissionPrelevee),
            interetDu: BigInt(interetPreleve),
            montantNet: BigInt(montantNet),
            dateRetrait: dto.dateRetrait ?? new Date(),
            receiptNumber: await prochainRecu(tx),
            idempotencyKey: id,
          },
        });

        if (dto.type === 'TOTAL') {
          await tx.contrat.update({
            where: { id: contrat.id },
            data: { statut: 'CLOTURE_ANTICIPEE' },
          });
        }
        return retrait;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.retrait.findUnique({
          where: { idempotencyKey: id },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }
}
