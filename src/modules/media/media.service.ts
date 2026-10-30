import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import type { Media } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { Env } from '@/config/env.validation';
import type { AuthAgent } from '@/modules/auth/types';
import {
  STOCKAGE_PHOTOS,
  type StockagePhotos,
} from './stockage/stockage-photos';

/** Extensions de fichier autorisées, indexées par type MIME. */
const MIMES_AUTORISES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export interface FichierEntrant {
  id?: string;
  buffer: Buffer;
  mime: string;
  taille: number;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(STOCKAGE_PHOTOS) private readonly stockage: StockagePhotos,
  ) {}

  private get tailleMax(): number {
    return this.config.get('MEDIA_MAX_BYTES', { infer: true });
  }

  /**
   * Enregistre une photo : validation MIME/taille, idempotence par `id`,
   * déduplication par `checksum`, écriture dans le stockage, création de l'enregistrement.
   */
  async enregistrer(fichier: FichierEntrant): Promise<Media> {
    const extension = MIMES_AUTORISES[fichier.mime];
    if (!extension) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Format non supporté (JPEG ou PNG uniquement).',
      });
    }
    if (fichier.taille <= 0 || fichier.taille > this.tailleMax) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Taille de fichier invalide (max ${this.tailleMax} octets).`,
      });
    }

    // Idempotence : un id déjà connu renvoie le média existant (re-upload).
    if (fichier.id) {
      const existant = await this.prisma.media.findUnique({
        where: { id: fichier.id },
      });
      if (existant) return existant;
    }

    // Déduplication par contenu.
    const checksum =
      'sha256:' + createHash('sha256').update(fichier.buffer).digest('hex');
    const parChecksum = await this.prisma.media.findUnique({
      where: { checksum },
    });
    if (parChecksum) return parChecksum;

    const id = fichier.id ?? randomUUID();
    const nomFichier = `${id}.${extension}`;
    await this.stockage.ecrire(nomFichier, fichier.buffer, fichier.mime);

    return this.prisma.media.create({
      data: {
        id,
        mime: fichier.mime,
        tailleOctets: fichier.taille,
        checksum,
        chemin: nomFichier,
      },
    });
  }

  /**
   * Renvoie l'enregistrement + le binaire d'un média. Un AGENT ne peut lire que les
   * photos de ses propres membres (superviseur/admin : accès global).
   */
  async lireFichier(
    id: string,
    agent: AuthAgent,
  ): Promise<{ media: Media; buffer: Buffer }> {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Média introuvable');

    if (agent.role === 'AGENT') {
      const membre = await this.prisma.membre.findFirst({
        where: { photoId: id, ownerId: agent.id },
        select: { id: true },
      });
      if (!membre) throw new NotFoundException('Média introuvable');
    }

    const buffer = await this.stockage.lire(media.chemin);
    if (!buffer) {
      throw new NotFoundException('Fichier média absent du stockage');
    }
    return { media, buffer };
  }
}
