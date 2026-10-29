import { z } from 'zod';
import { lireDateTerrain } from '@/domain/date-terrain';

/** Description de la date terrain, reconnue aussi par la doc Swagger (`versOpenApi`). */
export const DESCRIPTION_DATE_TERRAIN =
  'Date terrain : chaîne ISO 8601 avec fuseau explicite (ex. 2026-10-29T22:30:00Z), au plus 15 minutes dans le futur, au plus 30 jours dans le passé, pas avant le début du contrat. Absente : heure du serveur.';

/** Même règle en synchro, où la date est obligatoire (spec 0003, AC-6 et AC-7). */
export const DESCRIPTION_DATE_TERRAIN_SYNCHRO =
  "Date terrain obligatoire : chaîne ISO 8601 avec fuseau explicite (ex. 2026-10-29T22:30:00Z), mêmes bornes qu'en direct. Absente ou invalide : conflit pour ce mouvement, le reste du lot est appliqué.";

/**
 * Date terrain d'un mouvement sur une route directe (spec 0003) : chaîne ISO 8601
 * avec fuseau explicite, convertie en `Date`. Utiliser `.optional()` : une date
 * absente prend l'heure du serveur dans le service, `null` est refusé (400).
 */
export const dateTerrainSchema = z
  .unknown()
  .transform((valeur, ctx) => {
    const lu = lireDateTerrain(valeur);
    if (!lu.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: lu.raison });
      return z.NEVER;
    }
    return lu.date;
  })
  .describe(DESCRIPTION_DATE_TERRAIN);
