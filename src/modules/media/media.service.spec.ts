import { BadRequestException } from '@nestjs/common';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Media } from '@prisma/client';
import { MediaService } from './media.service';

let mediaDir: string;

function getConfig(key: string): string | number {
  return key === 'MEDIA_DIR' ? mediaDir : 2_097_152;
}

function creerService(findUnique?: jest.Mock) {
  const prisma = {
    media: {
      findUnique: findUnique ?? jest.fn().mockResolvedValue(null),
      create: jest.fn((args: { data: Partial<Media> }) =>
        Promise.resolve(args.data as Media),
      ),
    },
  };
  const config = { get: getConfig };
  const service = new MediaService(prisma as never, config as never);
  return { service, prisma };
}

beforeAll(async () => {
  mediaDir = await mkdtemp(join(tmpdir(), 'agbajowo-media-'));
});

const imageJpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe('MediaService.enregistrer', () => {
  it('refuse un type MIME non autorisé', async () => {
    const { service } = creerService();
    const fichier = {
      buffer: imageJpeg(),
      mime: 'application/pdf',
      taille: 100,
    };
    await expect(service.enregistrer(fichier)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuse une taille au-delà du maximum', async () => {
    const { service } = creerService();
    const fichier = {
      buffer: imageJpeg(),
      mime: 'image/jpeg',
      taille: 3_000_000,
    };
    await expect(service.enregistrer(fichier)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuse une taille nulle', async () => {
    const { service } = creerService();
    const fichier = { buffer: Buffer.alloc(0), mime: 'image/png', taille: 0 };
    await expect(service.enregistrer(fichier)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('est idempotent : un id déjà présent renvoie le média existant', async () => {
    const existant = { id: 'abc', checksum: 'x' } as Media;
    const findUnique = jest.fn().mockResolvedValueOnce(existant);
    const { service, prisma } = creerService(findUnique);
    const fichier = {
      id: 'abc',
      buffer: imageJpeg(),
      mime: 'image/jpeg',
      taille: 100,
    };
    const res = await service.enregistrer(fichier);
    expect(res).toBe(existant);
    expect(prisma.media.create).not.toHaveBeenCalled();
  });

  it('déduplique par checksum', async () => {
    const existant = { id: 'deja', checksum: 'y' } as Media;
    // 1er appel (par id) → null ; 2e appel (par checksum) → existant
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existant);
    const { service, prisma } = creerService(findUnique);
    const fichier = {
      id: 'nouveau',
      buffer: imageJpeg(),
      mime: 'image/jpeg',
      taille: 100,
    };
    const res = await service.enregistrer(fichier);
    expect(res).toBe(existant);
    expect(prisma.media.create).not.toHaveBeenCalled();
  });

  it('crée un nouveau média et écrit le fichier', async () => {
    const { service, prisma } = creerService();
    const id = '11111111-1111-1111-1111-111111111111';
    const res = await service.enregistrer({
      id,
      buffer: imageJpeg(),
      mime: 'image/jpeg',
      taille: 6,
    });
    expect(prisma.media.create).toHaveBeenCalledTimes(1);
    expect(res.chemin).toBe(`${id}.jpg`);
    expect(res.checksum).toMatch(/^sha256:/);
  });
});
