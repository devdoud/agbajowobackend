import { z } from 'zod';

export const souscrireContratSchema = z.object({
  id: z.string().uuid().optional(),
  membreId: z.string().uuid(),
  groupe: z.enum(['GROUPE_1', 'GROUPE_2']),
  miseAmount: z.coerce.number().int().positive(),
  startDate: z.coerce.date(),
});

export type SouscrireContratDto = z.infer<typeof souscrireContratSchema>;
