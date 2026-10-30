import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import type { PrismaClient } from '@prisma/client';
import { genererMotDePasse } from '@/common/password';

export interface EntreePremierAdmin {
  telephone: string;
  nom: string;
}

/**
 * Crée le premier compte ADMIN d'une base de prod (spec 0004, mise en ligne AC-7),
 * comme `AgentsService.creer` : mot de passe temporaire tiré au hasard, numéro tiré de
 * `agent_seq`, changement de mot de passe obligatoire à la première connexion.
 * Le mot de passe temporaire n'est renvoyé qu'ici, une seule fois.
 */
export async function creerPremierAdmin(
  prisma: PrismaClient,
  entree: EntreePremierAdmin,
) {
  const telephone = entree.telephone.trim();
  const nom = entree.nom.trim();
  if (telephone.length < 8) {
    throw new Error('Téléphone invalide (au moins 8 caractères).');
  }
  if (nom.length < 2) {
    throw new Error('Nom invalide (au moins 2 caractères).');
  }
  const existant = await prisma.agent.findUnique({ where: { telephone } });
  if (existant) {
    throw new Error('Un compte existe déjà avec ce téléphone.');
  }

  const motDePasse = genererMotDePasse();
  const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('agent_seq')
  `;
  const agent = await prisma.agent.create({
    data: {
      id: randomUUID(),
      nom,
      telephone,
      passwordHash: await hash(motDePasse),
      role: 'ADMIN',
      numeroAgent: Number(nextval),
      mustChangePassword: true,
    },
    select: { id: true, nom: true, telephone: true, numeroAgent: true },
  });
  return { agent, motDePasse };
}
