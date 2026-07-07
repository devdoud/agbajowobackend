import { z } from 'zod';

export const modifierAgentSchema = z
  .object({
    actif: z.boolean().optional(),
    role: z.enum(['AGENT', 'SUPERVISEUR', 'ADMIN']).optional(),
    // Si vrai : régénère un mot de passe temporaire (renvoyé une seule fois).
    reinitialiserMotDePasse: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.actif !== undefined ||
      v.role !== undefined ||
      v.reinitialiserMotDePasse === true,
    { message: 'Aucune modification fournie' },
  );

export type ModifierAgentDto = z.infer<typeof modifierAgentSchema>;
