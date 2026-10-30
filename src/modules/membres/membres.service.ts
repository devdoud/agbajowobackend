import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { AuthAgent } from '@/modules/auth/types';
import type { CreerMembreDto } from './dto/creer-membre.dto';

/**
 * Chiffres d'un numéro, sans l'indicatif du Bénin : « +229 97 00 00 01 » et
 * « 97000001 » donnent la même clé. Même règle que la requête SQL de vérification.
 */
export function normaliserTelephone(telephone: string): string {
  return telephone.replace(/[^0-9]/g, '').replace(/^229(?=[0-9]{8})/, '');
}

export interface OptionsListe {
  q?: string;
  limit: number;
  cursor?: bigint;
}

@Injectable()
export class MembresService {
  constructor(private readonly prisma: PrismaService) {}

  private estGlobal(agent: AuthAgent): boolean {
    return agent.role === 'SUPERVISEUR' || agent.role === 'ADMIN';
  }

  /** Filtre de propriété : un AGENT ne voit que ses membres ; superviseur/admin voient tout. */
  private filtreProprietaire(agent: AuthAgent): Prisma.MembreWhereInput {
    return this.estGlobal(agent) ? {} : { ownerId: agent.id };
  }

  private async prochainNumero(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('membre_seq')
    `;
    return `MBR-${rows[0].nextval.toString().padStart(5, '0')}`;
  }

  async creer(agent: AuthAgent, dto: CreerMembreDto) {
    // La photo est facultative ; si fournie, elle doit avoir été uploadée au préalable.
    if (dto.photoId) {
      const photo = await this.prisma.media.findUnique({
        where: { id: dto.photoId },
      });
      if (!photo) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message:
            'Photo introuvable : uploader la photo avant de créer le membre.',
        });
      }
    }

    return this.prisma.membre.create({
      data: {
        id: dto.id ?? randomUUID(),
        ownerId: agent.id,
        numeroMembre: await this.prochainNumero(),
        codeMembre: dto.codeMembre ?? null,
        nom: dto.nom,
        prenoms: dto.prenoms,
        telephone: dto.telephone ?? null,
        dateNaissance: dto.dateNaissance ?? null,
        lieuNaissance: dto.lieuNaissance ?? null,
        profession: dto.profession,
        quartier: dto.quartier,
        arrondissement: dto.arrondissement ?? null,
        commune: dto.commune ?? null,
        photoId: dto.photoId ?? null,
        dateSouscription: dto.dateSouscription ?? new Date(),
      },
    });
  }

  async liste(agent: AuthAgent, options: OptionsListe) {
    const where: Prisma.MembreWhereInput = {
      deletedAt: null,
      ...this.filtreProprietaire(agent),
    };
    if (options.cursor !== undefined) {
      where.serverSeq = { gt: options.cursor };
    }
    if (options.q) {
      where.OR = [
        { nom: { contains: options.q, mode: 'insensitive' } },
        { prenoms: { contains: options.q, mode: 'insensitive' } },
        { numeroMembre: { contains: options.q, mode: 'insensitive' } },
        { codeMembre: { contains: options.q, mode: 'insensitive' } },
        { telephone: { contains: options.q } },
      ];
    }

    const rows = await this.prisma.membre.findMany({
      where,
      orderBy: { serverSeq: 'asc' },
      take: options.limit + 1,
    });
    const hasMore = rows.length > options.limit;
    const data = hasMore ? rows.slice(0, options.limit) : rows;
    const nextCursor = hasMore
      ? data[data.length - 1].serverSeq.toString()
      : null;
    return { data, nextCursor, hasMore };
  }

  /**
   * Doublon possible (spec 0005) : membres de TOUS les agents ayant ce numéro. Un AGENT
   * n'apprend que le numéro de membre et l'agent qui le suit, jamais la fiche d'un
   * membre d'un autre agent (`id`, nom et prénoms restent à null).
   */
  async verifierTelephone(agent: AuthAgent, telephone: string) {
    const cible = normaliserTelephone(telephone);
    const trouves = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM membres
      WHERE deleted_at IS NULL
        AND regexp_replace(
          regexp_replace(telephone, '[^0-9]', '', 'g'), '^229(?=[0-9]{8})', ''
        ) = ${cible}
    `;
    const membres = await this.prisma.membre.findMany({
      where: { id: { in: trouves.map((t) => t.id) } },
      select: {
        id: true,
        numeroMembre: true,
        nom: true,
        prenoms: true,
        ownerId: true,
        owner: { select: { id: true, nom: true, numeroAgent: true } },
      },
      orderBy: { serverSeq: 'asc' },
    });
    return {
      existe: membres.length > 0,
      membres: membres.map((m) => {
        const visible = this.estGlobal(agent) || m.ownerId === agent.id;
        return {
          id: visible ? m.id : null,
          numeroMembre: m.numeroMembre,
          nom: visible ? m.nom : null,
          prenoms: visible ? m.prenoms : null,
          estAMoi: m.ownerId === agent.id,
          agent: {
            ...(this.estGlobal(agent) ? { id: m.owner.id } : {}),
            nom: m.owner.nom,
            numeroAgent: m.owner.numeroAgent,
          },
        };
      }),
    };
  }

  async detail(agent: AuthAgent, id: string) {
    const membre = await this.prisma.membre.findFirst({
      where: { id, deletedAt: null, ...this.filtreProprietaire(agent) },
      include: { contrats: { where: { deletedAt: null } } },
    });
    if (!membre) throw new NotFoundException('Membre introuvable');
    return membre;
  }
}
