import type { PrismaService } from '@/prisma/prisma.service';

/**
 * Vide toutes les tables métier (sauf `_prisma_migrations`). Les séquences
 * (`receipt_seq`, `sync_seq`…) ne sont pas remises à zéro.
 * Garde fou : refuse de tourner ailleurs que sur la base du conteneur de test.
 */
export async function viderBase(prisma: PrismaService): Promise<void> {
  const attendue = process.env.TEST_DATABASE_URL;
  if (!attendue || process.env.DATABASE_URL !== attendue) {
    throw new Error(
      'viderBase refusé : DATABASE_URL ne pointe pas sur la base de test.',
    );
  }
  const [{ current_database: nom }] = await prisma.$queryRaw<
    { current_database: string }[]
  >`SELECT current_database()`;
  if (nom !== process.env.TEST_DATABASE_NAME) {
    throw new Error(`viderBase refusé : base inattendue « ${nom} ».`);
  }

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const liste = tables
    .map((t) => `"${t.tablename.replace(/"/g, '""')}"`)
    .join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${liste} RESTART IDENTITY CASCADE`,
  );
}
