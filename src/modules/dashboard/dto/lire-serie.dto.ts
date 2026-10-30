import { z } from 'zod';

export const JOURS_SERIE_MAX = 90;

/** Query de la courbe par jour (spec 0005). */
export const lireSerieSchema = z.object({
  jours: z.coerce
    .number()
    .int()
    .min(1)
    .max(JOURS_SERIE_MAX)
    .default(14)
    .describe(
      `Nombre de jours du Bénin, aujourd'hui compris (1 à ${JOURS_SERIE_MAX}, 14 par défaut).`,
    ),
  agentId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'SUPERVISEUR et ADMIN : un seul compte (tous par défaut). Un AGENT ne lit que le sien (404 sinon).',
    ),
});
export type LireSerieDto = z.infer<typeof lireSerieSchema>;
