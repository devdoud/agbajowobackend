/** Numérotation des mises dans le livret (cases 1→31/mois pour G1, 1→96/an pour G2). */

export interface PlageMises {
  debut: number;
  fin: number;
}

/**
 * Positions occupées par un versement de `misesCount` mises, sachant `misesDejaVersees`
 * déjà enregistrées sur le contrat.
 */
export function plageMises(
  misesDejaVersees: number,
  misesCount: number,
): PlageMises {
  if (misesDejaVersees < 0) {
    throw new Error('misesDejaVersees ne peut pas être négatif');
  }
  if (!Number.isInteger(misesCount) || misesCount <= 0) {
    throw new Error('misesCount doit être un entier positif');
  }
  return { debut: misesDejaVersees + 1, fin: misesDejaVersees + misesCount };
}

/** Index du « mois » du livret (1-based) auquel appartient une position de mise. */
export function moisDeMise(position: number, misesParMois: number): number {
  if (!Number.isInteger(position) || position <= 0) {
    throw new Error('position doit être un entier positif');
  }
  if (!Number.isInteger(misesParMois) || misesParMois <= 0) {
    throw new Error('misesParMois doit être un entier positif');
  }
  return Math.ceil(position / misesParMois);
}
