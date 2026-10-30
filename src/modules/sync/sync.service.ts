import { HttpException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { MembresService } from '@/modules/membres/membres.service';
import { ContratsService } from '@/modules/contrats/contrats.service';
import { CollecteService } from '@/modules/collecte/collecte.service';
import { AvancesService } from '@/modules/avances/avances.service';
import { RetraitsService } from '@/modules/retraits/retraits.service';
import { dateEcheance, parametresGroupe } from '@/domain/parametres-groupe';
import {
  lireDateTerrain,
  type LectureDateTerrain,
} from '@/domain/date-terrain';
import type { AuthAgent } from '@/modules/auth/types';
import type { PushDto, MembrePush, ContratPush } from './dto/push.dto';

export interface Conflit {
  entity: string;
  id: string;
  reason: string;
}

/** Extrait un motif lisible d'une erreur (HttpException ou Error). */
function raison(error: unknown): string {
  if (error instanceof HttpException) {
    const rep = error.getResponse();
    if (typeof rep === 'object' && rep !== null && 'message' in rep) {
      return String(rep.message);
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Erreur inconnue';
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membres: MembresService,
    private readonly contrats: ContratsService,
    private readonly collecte: CollecteService,
    private readonly avances: AvancesService,
    private readonly retraits: RetraitsService,
  ) {}

  private scopeGlobal(agent: AuthAgent): boolean {
    return agent.role === 'SUPERVISEUR' || agent.role === 'ADMIN';
  }

  // ─────────────────────────── PUSH ───────────────────────────

  /**
   * Date terrain d'un mouvement poussé (spec 0003). Une date absente ou illisible
   * n'est tolérée que pour rejouer un mouvement déjà enregistré (anciens lots sans
   * date) : le service le renvoie alors tel quel, sans contrôle de bornes.
   */
  private async dateDuMouvement(
    valeur: unknown,
    existant: () => Promise<unknown>,
  ): Promise<
    | { ok: true; date: Date | undefined }
    | Extract<LectureDateTerrain, { ok: false }>
  > {
    const lu = lireDateTerrain(valeur);
    if (lu.ok) return lu;
    if (await existant()) return { ok: true, date: undefined };
    return lu;
  }

  async push(agent: AuthAgent, dto: PushDto) {
    const applied = {
      membres: [] as unknown[],
      contrats: [] as unknown[],
      versements: [] as unknown[],
      avances: [] as unknown[],
      retraits: [] as unknown[],
    };
    const conflicts: Conflit[] = [];

    // Ordre par dépendances : membres → contrats → versements → avances → retraits.
    for (const m of dto.membres) {
      try {
        const res = await this.pushMembre(agent, m);
        applied.membres.push({
          id: res.id,
          numeroMembre: res.numeroMembre,
          serverSeq: res.serverSeq.toString(),
          updatedAt: res.updatedAt,
        });
      } catch (error) {
        conflicts.push({ entity: 'membre', id: m.id, reason: raison(error) });
      }
    }

    for (const c of dto.contrats) {
      try {
        const res = await this.pushContrat(agent, c);
        applied.contrats.push({
          id: res.id,
          serverSeq: res.serverSeq.toString(),
          updatedAt: res.updatedAt,
        });
      } catch (error) {
        conflicts.push({ entity: 'contrat', id: c.id, reason: raison(error) });
      }
    }

    for (const v of dto.versements) {
      try {
        const date = await this.dateDuMouvement(v.paidAt, () =>
          this.prisma.versement.findUnique({
            where: { idempotencyKey: v.id },
            select: { id: true },
          }),
        );
        if (!date.ok) {
          conflicts.push({
            entity: 'versement',
            id: v.id,
            reason: date.raison,
          });
          continue;
        }
        const res = await this.collecte.encaisser(agent, {
          ...v,
          paidAt: date.date,
        });
        applied.versements.push({
          id: res.id,
          receiptNumber: res.receiptNumber,
          numeroMiseDebut: res.numeroMiseDebut,
          numeroMiseFin: res.numeroMiseFin,
          serverSeq: res.serverSeq.toString(),
        });
      } catch (error) {
        conflicts.push({
          entity: 'versement',
          id: v.id,
          reason: raison(error),
        });
      }
    }

    for (const a of dto.avances) {
      try {
        const date = await this.dateDuMouvement(a.dateAvance, () =>
          this.prisma.avance.findUnique({
            where: { idempotencyKey: a.id },
            select: { id: true },
          }),
        );
        if (!date.ok) {
          conflicts.push({ entity: 'avance', id: a.id, reason: date.raison });
          continue;
        }
        const res = await this.avances.accorder(agent, {
          ...a,
          dateAvance: date.date,
        });
        applied.avances.push({
          id: res.id,
          receiptNumber: res.receiptNumber,
          interet: res.interet.toString(),
          serverSeq: res.serverSeq.toString(),
        });
      } catch (error) {
        conflicts.push({ entity: 'avance', id: a.id, reason: raison(error) });
      }
    }

    for (const r of dto.retraits) {
      try {
        const date = await this.dateDuMouvement(r.dateRetrait, () =>
          this.prisma.retrait.findUnique({
            where: { idempotencyKey: r.id },
            select: { id: true },
          }),
        );
        if (!date.ok) {
          conflicts.push({ entity: 'retrait', id: r.id, reason: date.raison });
          continue;
        }
        const res = await this.retraits.effectuer(agent, {
          ...r,
          dateRetrait: date.date,
        });
        applied.retraits.push({
          id: res.id,
          receiptNumber: res.receiptNumber,
          montantNet: res.montantNet.toString(),
          serverSeq: res.serverSeq.toString(),
        });
      } catch (error) {
        conflicts.push({ entity: 'retrait', id: r.id, reason: raison(error) });
      }
    }

    return { applied, conflicts, serverSeq: await this.curseurActuel() };
  }

  /** Crée le membre s'il est nouveau, sinon applique un last-write-wins. */
  private async pushMembre(agent: AuthAgent, m: MembrePush) {
    const existant = await this.prisma.membre.findUnique({
      where: { id: m.id },
    });
    if (!existant) {
      return this.membres.creer(agent, m);
    }
    if (existant.ownerId !== agent.id && !this.scopeGlobal(agent)) {
      throw new Error('FORBIDDEN');
    }
    // LWW : si l'entrant est plus ancien, le serveur garde sa version (renvoyée telle
    // quelle pour que le client se réaligne) — pas d'erreur.
    const entrant = m.updatedAt?.getTime() ?? Date.now();
    if (entrant < existant.updatedAt.getTime()) {
      return existant;
    }
    return this.prisma.membre.update({
      where: { id: m.id },
      data: {
        nom: m.nom,
        prenoms: m.prenoms,
        telephone: m.telephone,
        dateNaissance: m.dateNaissance,
        lieuNaissance: m.lieuNaissance,
        profession: m.profession,
        quartier: m.quartier,
        arrondissement: m.arrondissement,
        commune: m.commune,
        photoId: m.photoId,
        version: { increment: 1 },
      },
    });
  }

  /** Souscrit le contrat s'il est nouveau, sinon applique un last-write-wins. */
  private async pushContrat(agent: AuthAgent, c: ContratPush) {
    const existant = await this.prisma.contrat.findUnique({
      where: { id: c.id },
    });
    if (!existant) {
      return this.contrats.souscrire(agent, c);
    }
    if (existant.ownerId !== agent.id && !this.scopeGlobal(agent)) {
      throw new Error('FORBIDDEN');
    }
    // LWW silencieux (cf. pushMembre).
    const entrant = c.updatedAt?.getTime() ?? Date.now();
    if (entrant < existant.updatedAt.getTime()) {
      return existant;
    }
    // Intégrité du grand livre : les paramètres financiers sont verrouillés dès qu'il
    // existe un mouvement (versement/avance/retrait). On accepte un push identique
    // (re-synchro) mais on rejette toute modification.
    const mouvements =
      (await this.prisma.versement.count({ where: { contratId: c.id } })) +
      (await this.prisma.avance.count({ where: { contratId: c.id } })) +
      (await this.prisma.retrait.count({ where: { contratId: c.id } }));
    if (mouvements > 0) {
      const inchange =
        existant.groupe === c.groupe &&
        Number(existant.miseAmount) === c.miseAmount &&
        existant.startDate.getTime() === new Date(c.startDate).getTime();
      if (!inchange) {
        throw new Error(
          'Contrat avec mouvements : paramètres verrouillés (clôturer et re-souscrire).',
        );
      }
      return existant;
    }
    const p = parametresGroupe(c.groupe);
    return this.prisma.contrat.update({
      where: { id: c.id },
      data: {
        groupe: c.groupe,
        cadence: p.cadence,
        intervalleJours: p.intervalleJours,
        moisParCycle: p.moisParCycle,
        misesParMois: p.misesParMois,
        targetMises: p.targetMises,
        miseAmount: BigInt(c.miseAmount),
        commissionParMois: p.commissionParMois,
        commissionParCycle: p.commissionParCycle,
        creditAutorise: p.creditAutorise,
        maxAvances: p.maxAvances,
        startDate: c.startDate,
        endDate: dateEcheance(c.startDate, p),
        version: { increment: 1 },
      },
    });
  }

  // ─────────────────────────── PULL ───────────────────────────

  /**
   * Renvoie les changements dont `server_seq > since`, tous types confondus, jusqu'à
   * `limit` au total (curseur global). On récupère `limit + 1` par table puis on borne
   * au `limit`-ième plus petit `server_seq` : la fenêtre est ainsi complète et sans trou.
   */
  async pull(agent: AuthAgent, since: bigint, limit: number) {
    const membreWhere: Prisma.MembreWhereInput = this.scopeGlobal(agent)
      ? { serverSeq: { gt: since } }
      : { serverSeq: { gt: since }, ownerId: agent.id };
    // Mouvements d'un AGENT : ceux qu'il a saisis, et tous ceux des contrats dont il est
    // propriétaire (un superviseur peut encaisser chez ses membres ; sans eux, ses soldes
    // et son livret hors ligne seraient faux).
    const agentWhere = this.scopeGlobal(agent)
      ? { serverSeq: { gt: since } }
      : {
          serverSeq: { gt: since },
          OR: [{ agentId: agent.id }, { contrat: { ownerId: agent.id } }],
        };

    const [membres, contrats, versements, avances, retraits] =
      await Promise.all([
        this.prisma.membre.findMany({
          where: membreWhere,
          orderBy: { serverSeq: 'asc' },
          take: limit + 1,
        }),
        this.prisma.contrat.findMany({
          where: this.scopeGlobal(agent)
            ? { serverSeq: { gt: since } }
            : { serverSeq: { gt: since }, ownerId: agent.id },
          orderBy: { serverSeq: 'asc' },
          take: limit + 1,
        }),
        this.prisma.versement.findMany({
          where: agentWhere,
          orderBy: { serverSeq: 'asc' },
          take: limit + 1,
        }),
        this.prisma.avance.findMany({
          where: agentWhere,
          orderBy: { serverSeq: 'asc' },
          take: limit + 1,
        }),
        this.prisma.retrait.findMany({
          where: agentWhere,
          orderBy: { serverSeq: 'asc' },
          take: limit + 1,
        }),
      ]);

    const seqs = [
      ...membres,
      ...contrats,
      ...versements,
      ...avances,
      ...retraits,
    ]
      .map((r) => r.serverSeq)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const hasMore = seqs.length > limit;
    const cutoff = hasMore
      ? seqs[limit - 1]
      : seqs.length > 0
        ? seqs[seqs.length - 1]
        : since;

    const borne = <T extends { serverSeq: bigint }>(rows: T[]): T[] =>
      rows.filter((r) => r.serverSeq <= cutoff);

    return {
      changes: {
        membres: borne(membres),
        contrats: borne(contrats),
        versements: borne(versements),
        avances: borne(avances),
        retraits: borne(retraits),
      },
      nextCursor: cutoff.toString(),
      hasMore,
    };
  }

  /** Valeur courante du curseur global (dernier server_seq attribué). */
  private async curseurActuel(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ last_value: bigint }[]>`
      SELECT last_value FROM sync_seq
    `;
    return rows[0].last_value.toString();
  }
}
