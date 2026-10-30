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
import { commissionDue } from '@/domain/commission';
import {
  calculerRetraitPartiel,
  calculerRetraitTotal,
  recuperableNet,
  type EtatRetrait,
} from '@/domain/retrait';
import type { AuthAgent } from '@/modules/auth/types';
import type { EffectuerRetraitDto } from './dto/effectuer-retrait.dto';

@Injectable()
export class RetraitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  private estGlobal(agent: AuthAgent): boolean {
    return agent.role === 'SUPERVISEUR' || agent.role === 'ADMIN';
  }

  /**
   * Effectue un retrait. La commission (et l'intérêt) restant dus sont prélevés en
   * priorité sur les cotisations (R2/R9), une seule fois.
   *  - TOTAL : clôture anticipée ; le membre reçoit le net récupérable.
   *  - PARTIEL : le membre reçoit le montant demandé (≤ récupérable) ; la commission/
   *    intérêt restants sont prélevés d'abord.
   */
  async effectuer(agent: AuthAgent, dto: EffectuerRetraitDto) {
    const id = dto.id ?? randomUUID();

    const existant = await this.prisma.retrait.findUnique({
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
        const dejaEnregistre = await tx.retrait.findUnique({
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
            message: 'Contrat non actif : retrait impossible.',
          });
        }

        // Date terrain plausible (spec 0003) : elle range l'argent dans un jour.
        const dateTerrain = dto.dateRetrait ?? maintenant;
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

        const [vAgg, avances, rAgg] = await Promise.all([
          tx.versement.aggregate({
            where: { contratId: contrat.id },
            _sum: { amount: true, misesCount: true },
          }),
          tx.avance.findMany({ where: { contratId: contrat.id } }),
          tx.retrait.aggregate({
            where: { contratId: contrat.id },
            _sum: {
              montantBrut: true,
              commissionPrelevee: true,
              interetDu: true,
            },
          }),
        ]);

        const soldeBrut = Number(vAgg._sum.amount ?? 0n);
        const misesVersees = vAgg._sum.misesCount ?? 0;
        const dejaRetire = Number(rAgg._sum.montantBrut ?? 0n);
        const commissionDejaPrelevee = Number(
          rAgg._sum.commissionPrelevee ?? 0n,
        );
        const interetDejaPreleve = Number(rAgg._sum.interetDu ?? 0n);
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

        const etat: EtatRetrait = {
          brutDisponible: soldeBrut - dejaRetire,
          commissionRestante: Math.max(0, commission - commissionDejaPrelevee),
          interetRestant: Math.max(0, interetDu - interetDejaPreleve),
          avanceRestante,
        };

        let montantBrut: number;
        let montantNet: number;
        let commissionPrelevee: number;
        let interetPreleve: number;

        if (dto.type === 'TOTAL') {
          ({ montantBrut, montantNet, commissionPrelevee, interetPreleve } =
            calculerRetraitTotal(etat));
        } else {
          const montant = dto.montant ?? 0;
          const plafond = recuperableNet(etat);
          if (montant > plafond) {
            throw new UnprocessableEntityException({
              code: 'BUSINESS_RULE',
              message: `Montant supérieur au récupérable (${plafond} FCFA).`,
            });
          }
          ({ montantBrut, montantNet, commissionPrelevee, interetPreleve } =
            calculerRetraitPartiel(etat, montant));
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
            dateRetrait: dateTerrain,
            receiptNumber: await prochainRecu(tx, maintenant),
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
