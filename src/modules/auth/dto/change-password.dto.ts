import { z } from 'zod';

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  // Politique minimale : 8 caractères, au moins une lettre et un chiffre.
  newPassword: z
    .string()
    .min(8, 'Au moins 8 caractères')
    .regex(/[A-Za-z]/, 'Au moins une lettre')
    .regex(/[0-9]/, 'Au moins un chiffre'),
});

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
