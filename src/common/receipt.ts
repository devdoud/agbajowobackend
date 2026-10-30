import { Prisma } from '@prisma/client';
import { jourBenin } from '@/domain/caisse';

/**
 * Numéro de reçu officiel « REC-AAAAMMJJ-NNNNN », tiré de la séquence Postgres
 * `receipt_seq` (compteur global). À appeler dans une transaction. La date est le jour
 * du Bénin de `maintenant` (ClockService), jamais celui du serveur : en UTC, un reçu
 * émis entre minuit et une heure au Bénin porterait sinon la date de la veille.
 */
export async function prochainRecu(
  tx: Prisma.TransactionClient,
  maintenant: Date,
): Promise<string> {
  const rows = await tx.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('receipt_seq')
  `;
  const n = rows[0].nextval.toString().padStart(5, '0');
  const date = jourBenin(maintenant).replace(/-/g, '');
  return `REC-${date}-${n}`;
}
