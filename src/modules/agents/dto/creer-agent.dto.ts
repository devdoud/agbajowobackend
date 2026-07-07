import { z } from 'zod';

export const creerAgentSchema = z.object({
  nom: z.string().min(2),
  telephone: z.string().min(8),
  // Rôle attribué. Un SUPERVISEUR ne peut créer que des AGENT (contrôlé côté service).
  role: z.enum(['AGENT', 'SUPERVISEUR', 'ADMIN']).optional().default('AGENT'),
});

export type CreerAgentDto = z.infer<typeof creerAgentSchema>;
