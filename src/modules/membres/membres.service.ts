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

  async detail(agent: AuthAgent, id: string) {
    const membre = await this.prisma.membre.findFirst({
      where: { id, deletedAt: null, ...this.filtreProprietaire(agent) },
      include: { contrats: { where: { deletedAt: null } } },
    });
    if (!membre) throw new NotFoundException('Membre introuvable');
    return membre;
  }
}
