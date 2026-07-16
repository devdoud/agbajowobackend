import { z } from 'zod';

const membrePush = z.object({
  id: z.string().uuid(),
  codeMembre: z.string().min(1).nullish(),
  nom: z.string().min(2),
  prenoms: z.string().min(2),
  profession: z.string().min(1),
  quartier: z.string().min(1),
  // Champs facultatifs (cohérent avec la création directe).
  telephone: z.string().min(8).nullish(),
  dateNaissance: z.coerce.date().nullish(),
  lieuNaissance: z.string().min(1).nullish(),
  arrondissement: z.string().min(1).nullish(),
  commune: z.string().min(1).nullish(),
  photoId: z.string().uuid().nullish(),
  dateSouscription: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  version: z.coerce.number().int().optional(),
});

const contratPush = z.object({
  id: z.string().uuid(),
  membreId: z.string().uuid(),
  groupe: z.enum(['GROUPE_1', 'GROUPE_2']),
  miseAmount: z.coerce.number().int().positive(),
  startDate: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  version: z.coerce.number().int().optional(),
});

const versementPush = z.object({
  id: z.string().uuid(),
  contratId: z.string().uuid(),
  misesCount: z.coerce.number().int().positive(),
  paidAt: z.coerce.date().optional(),
});

const avancePush = z.object({
  id: z.string().uuid(),
  contratId: z.string().uuid(),
  nbMois: z.coerce.number().int().min(1).max(3),
  montant: z.coerce.number().int().positive(),
  dateAvance: z.coerce.date().optional(),
});

const retraitPush = z.object({
  id: z.string().uuid(),
  contratId: z.string().uuid(),
  type: z.enum(['PARTIEL', 'TOTAL']),
  montant: z.coerce.number().int().positive().optional(),
  dateRetrait: z.coerce.date().optional(),
});

/** Lot de mutations locales poussées par un agent, ordonnées par dépendances. */
export const pushSchema = z.object({
  membres: z.array(membrePush).default([]),
  contrats: z.array(contratPush).default([]),
  versements: z.array(versementPush).default([]),
  avances: z.array(avancePush).default([]),
  retraits: z.array(retraitPush).default([]),
});

export type PushDto = z.infer<typeof pushSchema>;
export type MembrePush = z.infer<typeof membrePush>;
export type ContratPush = z.infer<typeof contratPush>;
