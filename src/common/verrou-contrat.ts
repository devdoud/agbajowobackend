import { Prisma } from '@prisma/client';

/**
 * Verrouille la ligne du contrat (`SELECT ... FOR UPDATE`) jusqu'à la fin de la
 * transaction. À appeler en tout premier dans une transaction qui lit les agrégats
 * d'un contrat puis écrit un mouvement : deux opérations simultanées sur le même
 * contrat passent alors l'une après l'autre, et la seconde voit les écritures de la
 * première (pas de dépassement d'objectif, pas de double retrait).
 * Sans effet si le contrat n'existe pas (la lecture suivante renverra 404).
 * Juste après le verrou, l'appelant relit son `idempotencyKey` dans la transaction :
 * une relance du même id a pu attendre ici pendant que l'original s'enregistrait,
 * et doit être rejouée avant les règles métier (sinon elle reçoit un 422).
 */
export async function verrouillerContrat(
  tx: Prisma.TransactionClient,
  contratId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM contrats WHERE id = ${contratId}::uuid FOR UPDATE
  `;
}
