import { z } from 'zod';

export const encaisserSchema = z.object({
  id: z.string().uuid().optional(),
  contratId: z.string().uuid(),
  misesCount: z.coerce.number().int().positive(),
  paidAt: z.coerce.date().optional(),
});

export type EncaisserDto = z.infer<typeof encaisserSchema>;
