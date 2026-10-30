import { z } from 'zod';
import { dateTerrainSchema } from '@/common/schemas/date-terrain.schema';

export const accorderAvanceSchema = z.object({
  id: z.string().uuid().optional(),
  contratId: z.string().uuid(),
  nbMois: z.coerce.number().int().min(1).max(3),
  montant: z.coerce.number().int().positive(),
  dateAvance: dateTerrainSchema.optional(),
});

export type AccorderAvanceDto = z.infer<typeof accorderAvanceSchema>;
