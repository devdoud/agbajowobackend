import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { StockageDisque } from './stockage-disque';
import { StockageS3 } from './stockage-s3';
import type { StockagePhotos } from './stockage-photos';

const contenu = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

/** Première commande envoyée au client S3 simulé. */
function premiereCommande(send: jest.Mock): unknown {
  return (send.mock.calls as unknown[][])[0][0];
}

describe('StockageDisque', () => {
  it('écrit, relit et sait si un fichier existe', async () => {
    const stockage: StockagePhotos = new StockageDisque(
      await mkdtemp(join(tmpdir(), 'agbajowo-stockage-')),
    );

    await stockage.ecrire('a.jpg', contenu, 'image/jpeg');

    expect(await stockage.lire('a.jpg')).toEqual(contenu);
    expect(await stockage.existe('a.jpg')).toBe(true);
  });

  it('renvoie null pour un fichier absent', async () => {
    const stockage = new StockageDisque(
      await mkdtemp(join(tmpdir(), 'agbajowo-stockage-')),
    );

    expect(await stockage.lire('absent.jpg')).toBeNull();
    expect(await stockage.existe('absent.jpg')).toBe(false);
  });
});

describe('StockageS3', () => {
  function avecClient(send: jest.Mock) {
    return new StockageS3({ send } as unknown as S3Client, 'photos');
  }

  it('écrit l’objet dans le bucket avec son type MIME', async () => {
    const send = jest.fn().mockResolvedValue({});

    await avecClient(send).ecrire('a.jpg', contenu, 'image/jpeg');

    const commande = premiereCommande(send) as PutObjectCommand;
    expect(commande).toBeInstanceOf(PutObjectCommand);
    expect(commande.input).toMatchObject({
      Bucket: 'photos',
      Key: 'a.jpg',
      ContentType: 'image/jpeg',
    });
  });

  it('relit le contenu d’un objet', async () => {
    const send = jest.fn().mockResolvedValue({
      Body: { transformToByteArray: () => Promise.resolve(contenu) },
    });

    const lu = await avecClient(send).lire('a.jpg');

    expect(premiereCommande(send)).toBeInstanceOf(GetObjectCommand);
    expect(lu).toEqual(contenu);
  });

  it('renvoie null quand l’objet n’existe pas (NoSuchKey)', async () => {
    const send = jest
      .fn()
      .mockRejectedValue(new NoSuchKey({ message: 'absent', $metadata: {} }));

    expect(await avecClient(send).lire('absent.jpg')).toBeNull();
  });

  it('remonte les autres erreurs du stockage', async () => {
    const send = jest.fn().mockRejectedValue(new Error('réseau coupé'));

    await expect(avecClient(send).lire('a.jpg')).rejects.toThrow(
      'réseau coupé',
    );
  });

  it('teste l’existence par HeadObject', async () => {
    const present = jest.fn().mockResolvedValue({});
    const absent = jest
      .fn()
      .mockRejectedValue(new NotFound({ message: 'absent', $metadata: {} }));

    expect(await avecClient(present).existe('a.jpg')).toBe(true);
    expect(premiereCommande(present)).toBeInstanceOf(HeadObjectCommand);
    expect(await avecClient(absent).existe('b.jpg')).toBe(false);
  });
});
