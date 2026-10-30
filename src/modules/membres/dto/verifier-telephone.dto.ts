import { z } from 'zod';

/** Query de la vérification de doublon (spec 0005) : un numéro, au moins 8 chiffres. */
export const verifierTelephoneSchema = z.object({
  telephone: z
    .string()
    .refine((v) => v.replace(/[^0-9]/g, '').length >= 8, {
      message: 'Au moins 8 chiffres.',
    })
    .describe(
      'Numéro à vérifier. Espaces, points, tirets, « + » et indicatif 229 sont ignorés.',
    ),
});
export type VerifierTelephoneDto = z.infer<typeof verifierTelephoneSchema>;
