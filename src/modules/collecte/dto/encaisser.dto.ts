import { z } from 'zod';
import { dateTerrainSchema } from '@/common/schemas/date-terrain.schema';

export const encaisserSchema = z.object({
  id: z.string().uuid().optional(),
  contratId: z.string().uuid(),
  misesCount: z.coerce.number().int().positive(),
  paidAt: dateTerrainSchema.optional(),
});

export type EncaisserDto = z.infer<typeof encaisserSchema>;
