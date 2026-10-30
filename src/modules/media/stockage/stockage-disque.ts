import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { StockagePhotos } from './stockage-photos';

/** Photos sur le disque local, dans `MEDIA_DIR` (dev, tests, pile VPS). */
export class StockageDisque implements StockagePhotos {
  private readonly dossier: string;

  constructor(dossier: string) {
    this.dossier = resolve(dossier);
  }

  async ecrire(cle: string, contenu: Buffer): Promise<void> {
    await mkdir(this.dossier, { recursive: true });
    await writeFile(join(this.dossier, cle), contenu);
  }

  async lire(cle: string): Promise<Buffer | null> {
    const chemin = join(this.dossier, cle);
    if (!existsSync(chemin)) return null;
    return readFile(chemin);
  }

  existe(cle: string): Promise<boolean> {
    return Promise.resolve(existsSync(join(this.dossier, cle)));
  }
}
