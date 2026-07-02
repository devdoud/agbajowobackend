import { z } from 'zod';

export const creerMembreSchema = z.object({
  id: z.string().uuid().optional(),
  nom: z.string().min(2),
  prenoms: z.string().min(2),
  telephone: z.string().min(8),
  dateNaissance: z.coerce.date(),
  lieuNaissance: z.string().min(1),
  profession: z.string().min(1),
  quartier: z.string().min(1),
  arrondissement: z.string().min(1),
  commune: z.string().min(1),
  photoId: z.string().uuid(),
  dateSouscription: z.coerce.date().optional(),
});

export type CreerMembreDto = z.infer<typeof creerMembreSchema>;
