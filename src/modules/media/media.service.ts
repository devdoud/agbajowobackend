import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Media } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { Env } from '@/config/env.validation';

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
  ) {}

  private get dossier(): string {
    return resolve(this.config.get('MEDIA_DIR', { infer: true }));
  }

  private get tailleMax(): number {
    return this.config.get('MEDIA_MAX_BYTES', { infer: true });
  }

  /**
   * Enregistre une photo : validation MIME/taille, idempotence par `id`,
   * déduplication par `checksum`, écriture sur disque, création de l'enregistrement.
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
    await mkdir(this.dossier, { recursive: true });
    await writeFile(join(this.dossier, nomFichier), fichier.buffer);

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

  /** Renvoie l'enregistrement + le binaire d'un média. */
  async lireFichier(id: string): Promise<{ media: Media; buffer: Buffer }> {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Média introuvable');

    const chemin = join(this.dossier, media.chemin);
    if (!existsSync(chemin)) {
      throw new NotFoundException('Fichier média absent du stockage');
    }
    return { media, buffer: await readFile(chemin) };
  }
}
