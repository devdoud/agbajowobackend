import { z } from 'zod';

/**
 * Schéma de validation des variables d'environnement.
 *
 * Les variables réellement utilisées au lot courant (L0) sont requises ou ont une
 * valeur par défaut. Celles des lots suivants (BDD, JWT) sont optionnelles pour
 * l'instant et deviendront requises au fur et à mesure (L1, L2).
 */
const champs = z.object({
  // Application (L0)
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  // Origine du back office web. Obligatoire en prod (pas de repli localhost).
  CORS_ORIGIN: z.string().min(1).optional(),
  // Nombre de proxys de confiance devant l'API (Render : 1). 0 = aucun.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // En-tête qui porte l'IP du client, posé par l'hébergeur (Render : true-client-ip).
  // Absent = `req.ip`. Ne le régler que si l'hébergeur écrase la valeur envoyée par le client.
  CLIENT_IP_HEADER: z.string().min(1).optional(),

  // Base de données (L1) — requis
  DATABASE_URL: z.string().url(),
  // URL directe (pooler en mode session) pour les migrations. Obligatoire en prod ;
  // en dev et en tests, la même que DATABASE_URL (Prisma l'exige si elle est déclarée).
  DIRECT_URL: z.string().url().optional(),

  // Authentification (L2) — requis
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),

  // Médias / photos (L4)
  MEDIA_DIR: z.string().default('./media'),
  MEDIA_MAX_BYTES: z.coerce.number().int().positive().default(2_097_152), // 2 Mo
  // Où vivent les photos : disque local (dev, tests) ou stockage S3 (prod, Supabase).
  MEDIA_DRIVER: z.enum(['disque', 's3']).default('disque'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),

  // Documentation Swagger sur /api/v1/docs : éteinte par défaut (prod comprise).
  // Pas de z.coerce.boolean(), qui lirait la chaîne "false" comme vrai.
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const VARIABLES_S3 = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

export const envSchema = champs
  .superRefine((env, ctx) => {
    const manque = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (env.NODE_ENV === 'production') {
      if (!env.DIRECT_URL) manque('DIRECT_URL', 'obligatoire en production');
      if (!env.CORS_ORIGIN) manque('CORS_ORIGIN', 'obligatoire en production');
    }
    if (env.MEDIA_DRIVER === 's3') {
      for (const nom of VARIABLES_S3) {
        if (!env[nom]) manque(nom, 'obligatoire quand MEDIA_DRIVER=s3');
      }
    }
  })
  .transform((env) => ({
    ...env,
    // Le navigateur envoie l'origine sans barre finale : une URL collée avec « / » ne
    // correspondrait jamais.
    CORS_ORIGIN:
      env.CORS_ORIGIN?.replace(/\/+$/, '') ?? 'http://localhost:3000',
  }));

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
