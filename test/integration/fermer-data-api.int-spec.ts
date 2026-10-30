import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { creerAppDeTest, type AppDeTest } from '../support/app';

const MIGRATION = join(
  __dirname,
  '../../prisma/migrations/20261030090000_fermer_data_api_supabase/migration.sql',
);
const ROLES = ['anon', 'authenticated'];

/**
 * Sur Supabase, les rôles anon et authenticated lisent le schéma public par le Data API.
 * La migration doit leur retirer tout droit (spec 0004, mise en ligne AC-5).
 */
describe('migration de fermeture du Data API de Supabase', () => {
  let ctx: AppDeTest;

  beforeAll(async () => {
    ctx = await creerAppDeTest();
  });

  afterAll(async () => {
    for (const role of ROLES) {
      await ctx.prisma.$executeRawUnsafe(`DROP OWNED BY ${role}`);
      await ctx.prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${role}`);
    }
    await ctx.app.close();
  });

  async function droit(role: string, objet: string, privilege: string) {
    const [ligne] = await ctx.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `SELECT has_table_privilege('${role}', '${objet}', '${privilege}') AS ok`,
    );
    return ligne.ok;
  }

  it('retire aux rôles anon et authenticated tout droit sur les données', async () => {
    // Arrange : les rôles et les droits par défaut que Supabase pose.
    for (const role of ROLES) {
      await ctx.prisma.$executeRawUnsafe(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`,
      );
      await ctx.prisma.$executeRawUnsafe(
        `GRANT USAGE ON SCHEMA public TO ${role}`,
      );
      await ctx.prisma.$executeRawUnsafe(
        `GRANT ALL ON ALL TABLES IN SCHEMA public TO ${role}`,
      );
      await ctx.prisma.$executeRawUnsafe(
        `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
      );
    }
    expect(await droit('anon', 'versements', 'SELECT')).toBe(true);

    // Act : la migration telle qu'elle est livrée.
    await ctx.prisma.$executeRawUnsafe(readFileSync(MIGRATION, 'utf-8'));

    // Assert
    for (const role of ROLES) {
      for (const table of ['versements', 'membres', 'retraits', 'agents']) {
        expect(await droit(role, table, 'SELECT')).toBe(false);
        expect(await droit(role, table, 'INSERT')).toBe(false);
      }
    }
  });
});
