import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { StockagePhotos } from './stockage-photos';

/**
 * Photos dans un bucket S3 privé : Supabase Storage par son API compatible S3 en prod
 * (spec 0004). Le bucket n'est jamais public : l'API lit l'objet et le renvoie elle même.
 */
export class StockageS3 implements StockagePhotos {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async ecrire(cle: string, contenu: Buffer, mime: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: cle,
        Body: contenu,
        ContentType: mime,
      }),
    );
  }

  async lire(cle: string): Promise<Buffer | null> {
    try {
      const objet = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: cle }),
      );
      if (!objet.Body) return null;
      return Buffer.from(await objet.Body.transformToByteArray());
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  async existe(cle: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: cle }),
      );
      return true;
    } catch (error) {
      if (error instanceof NotFound || error instanceof NoSuchKey) return false;
      throw error;
    }
  }
}
