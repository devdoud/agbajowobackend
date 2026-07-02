/**
 * Commission (R2) :
 *  - Groupe 1 : 1 mise par mois **entamé** (jusqu'à `moisParCycle`).
 *  - Groupe 2 : `commissionParCycle` mises (3) dès que le cycle est entamé.
 * Un « mois » est un bloc de `misesParMois` mises (déterministe à partir des mises versées).
 */

export interface ParamsCommission {
  misesParMois: number;
  moisParCycle: number;
  miseAmount: number;
  commissionParMois: number | null; // G1
  commissionParCycle: number | null; // G2
}

/** Nombre de mois (blocs) entamés d'après les mises versées. */
export function moisEntames(
  misesVersees: number,
  misesParMois: number,
  moisParCycle: number,
): number {
  if (misesVersees <= 0) return 0;
  return Math.min(moisParCycle, Math.ceil(misesVersees / misesParMois));
}

/** Commission due (en FCFA) selon le groupe et les mises versées. */
export function commissionDue(
  params: ParamsCommission,
  misesVersees: number,
): number {
  if (params.commissionParMois != null) {
    return (
      moisEntames(misesVersees, params.misesParMois, params.moisParCycle) *
      params.commissionParMois *
      params.miseAmount
    );
  }
  if (params.commissionParCycle != null) {
    return misesVersees > 0 ? params.commissionParCycle * params.miseAmount : 0;
  }
  return 0;
}
