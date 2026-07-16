import { z } from 'zod';

export const creerMembreSchema = z.object({
  id: z.string().uuid().optional(),
  codeMembre: z.string().min(1).nullish(),
  nom: z.string().min(2),
  prenoms: z.string().min(2),
  profession: z.string().min(1),
  quartier: z.string().min(1),
  // Champs facultatifs (null ou absent accepté).
  telephone: z.string().min(8).nullish(),
  dateNaissance: z.coerce.date().nullish(),
  lieuNaissance: z.string().min(1).nullish(),
  arrondissement: z.string().min(1).nullish(),
  commune: z.string().min(1).nullish(),
  photoId: z.string().uuid().nullish(),
  dateSouscription: z.coerce.date().optional(),
});

export type CreerMembreDto = z.infer<typeof creerMembreSchema>;
