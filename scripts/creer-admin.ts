/**
 * Crée le premier compte ADMIN d'une base (spec 0004). À lancer une seule fois, en local,
 * contre la base de prod :
 *   DIRECT_URL='postgresql://…:5432/postgres' npm run admin:creer -- --telephone 22990000000 --nom "Prénom Nom"
 * Le mot de passe temporaire est affiché une seule fois ; il devra être changé à la
 * première connexion.
 */
import { PrismaClient } from '@prisma/client';
import { creerPremierAdmin } from '@/modules/agents/premier-admin';

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const telephone = argument('telephone');
  const nom = argument('nom');
  if (!telephone || !nom) {
    throw new Error(
      'Usage : npm run admin:creer -- --telephone <téléphone> --nom "<nom>"',
    );
  }
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DIRECT_URL (ou DATABASE_URL) est requise.');

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const { agent, motDePasse } = await creerPremierAdmin(prisma, {
      telephone,
      nom,
    });
    console.log(`✓ Compte ADMIN créé : ${agent.nom} (${agent.telephone}).`);
    console.log(
      `  Mot de passe temporaire, affiché une seule fois : ${motDePasse}`,
    );
    console.log('  Il devra être changé à la première connexion.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
