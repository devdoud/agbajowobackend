import { z } from 'zod';
import { dateTerrainSchema } from '@/common/schemas/date-terrain.schema';

export const effectuerRetraitSchema = z
  .object({
    id: z.string().uuid().optional(),
    contratId: z.string().uuid(),
    type: z.enum(['PARTIEL', 'TOTAL']),
    montant: z.coerce.number().int().positive().optional(),
    dateRetrait: dateTerrainSchema.optional(),
  })
  .refine((d) => d.type === 'TOTAL' || d.montant !== undefined, {
    message: 'Le montant est requis pour un retrait partiel.',
    path: ['montant'],
  });

export type EffectuerRetraitDto = z.infer<typeof effectuerRetraitSchema>;
