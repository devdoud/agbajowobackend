import { z } from 'zod';
import { lireDateTerrain } from '@/domain/date-terrain';

/**
 * Date terrain d'un mouvement sur une route directe (spec 0003) : chaîne ISO 8601
 * avec fuseau explicite, convertie en `Date`. Utiliser `.optional()` : une date
 * absente prend l'heure du serveur dans le service, `null` est refusé (400).
 */
export const dateTerrainSchema = z.unknown().transform((valeur, ctx) => {
  const lu = lireDateTerrain(valeur);
  if (!lu.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: lu.raison });
    return z.NEVER;
  }
  return lu.date;
});
