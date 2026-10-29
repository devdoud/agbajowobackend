import { z } from 'zod';
import { estJourValide } from '@/domain/caisse';

/** Query des deux routes : jour du Bénin facultatif (aujourd'hui par défaut). */
export const lireRapportSchema = z.object({
  date: z
    .string()
    .refine(estJourValide, {
      message: 'Date attendue au format YYYY-MM-DD, et qui existe.',
    })
    .describe(
      "Jour du Bénin (UTC+1) au format YYYY-MM-DD, aujourd'hui par défaut ; une date future est refusée.",
    )
    .optional(),
});

export type LireRapportDto = z.infer<typeof lireRapportSchema>;

export const agentParamSchema = z.object({
  agentId: z.string().uuid(),
});

export type AgentParamDto = z.infer<typeof agentParamSchema>;
