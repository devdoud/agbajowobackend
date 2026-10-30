/**
 * Où vivent les fichiers des photos (spec 0004, mise en ligne AC-3) : disque local en
 * dev et en tests, stockage S3 (Supabase Storage) en prod. `MediaService` ne connaît
 * que cette interface ; la clé d'un fichier est `media.chemin` (`<id>.<ext>`).
 */
export interface StockagePhotos {
  ecrire(cle: string, contenu: Buffer, mime: string): Promise<void>;
  /** Le contenu, ou `null` si l'objet n'existe pas. */
  lire(cle: string): Promise<Buffer | null>;
  existe(cle: string): Promise<boolean>;
}

/** Jeton d'injection du pilote choisi par `MEDIA_DRIVER`. */
export const STOCKAGE_PHOTOS = Symbol('STOCKAGE_PHOTOS');
