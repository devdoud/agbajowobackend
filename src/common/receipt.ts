import { Prisma } from '@prisma/client';

/**
 * Numéro de reçu officiel « REC-AAAAMMJJ-NNNNN », tiré de la séquence Postgres
 * `receipt_seq` (compteur global). À appeler dans une transaction.
 */
export async function prochainRecu(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const rows = await tx.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('receipt_seq')
  `;
  const n = rows[0].nextval.toString().padStart(5, '0');
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `REC-${date}-${n}`;
}
