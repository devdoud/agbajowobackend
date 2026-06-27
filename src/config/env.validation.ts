import { z } from 'zod';

/**
 * Schéma de validation des variables d'environnement.
 *
 * Les variables réellement utilisées au lot courant (L0) sont requises ou ont une
 * valeur par défaut. Celles des lots suivants (BDD, JWT) sont optionnelles pour
 * l'instant et deviendront requises au fur et à mesure (L1, L2).
 */
export const envSchema = z.object({
  // Application (L0)
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Base de données (L1) — requis
  DATABASE_URL: z.string().url(),

  // Authentification (L2) — optionnel pour l'instant
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valide la configuration au démarrage de l'application.
 * Échec rapide (fail-fast) avec un message clair si la config est invalide.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(
        (issue) =>
          `  - ${issue.path.join('.') || '(racine)'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(`Configuration d'environnement invalide :\n${issues}`);
  }

  return parsed.data;
}
