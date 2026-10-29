/**
 * Démarre un PostgreSQL 16 jetable (Testcontainers) pour toute la suite d'intégration,
 * applique les migrations Prisma, puis expose l'URL aux tests via `process.env`
 * (les tests tournent en série, dans ce même processus).
 */
import { execSync } from 'node:child_process';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

declare global {
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

export default async function globalSetup(): Promise<void> {
  let container: StartedPostgreSqlContainer;
  try {
    // Délai large : le premier téléchargement de l'image peut être lent (Windows).
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withStartupTimeout(180_000)
      .start();
  } catch (error) {
    throw new Error(
      'Docker est introuvable ou arrêté. Lance Docker Desktop puis relance npm run test:int.\n' +
        `Détail : ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  globalThis.__PG_CONTAINER__ = container;

  const uri = container.getConnectionUri();
  process.env.DATABASE_URL = uri;
  process.env.TEST_DATABASE_URL = uri;
  process.env.TEST_DATABASE_NAME = container.getDatabase();

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: uri },
    stdio: 'inherit',
    shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
  });
}
