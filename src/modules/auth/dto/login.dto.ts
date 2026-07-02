import { z } from 'zod';

export const loginSchema = z.object({
  telephone: z.string().min(8),
  password: z.string().min(1),
});

export type LoginDto = z.infer<typeof loginSchema>;
