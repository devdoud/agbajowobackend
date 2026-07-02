/**
 * Avance / crédit (R10) :
 *  - Plafond du principal = ⅘ × (montant mensuel attendu × nb de mois avancés).
 *  - Intérêt = (mise ÷ 2) × nb de mois avancés.
 *  - nb de mois ∈ [1, 3] ; au plus `maxAvances` avances par contrat.
 */

export const PLAFOND_RATIO = 4 / 5;
export const MAX_MOIS_AVANCE = 3;

/** Montant mensuel attendu = mises/mois × montant d'une mise. */
export function montantAttenduMensuel(
  misesParMois: number,
  miseAmount: number,
): number {
  return misesParMois * miseAmount;
}

/** Plafond du principal avançable pour `nbMois` mois. */
export function plafondAvance(
  misesParMois: number,
  miseAmount: number,
  nbMois: number,
): number {
  return Math.floor(
    PLAFOND_RATIO * montantAttenduMensuel(misesParMois, miseAmount) * nbMois,
  );
}

/** Intérêt prélevé pour l'avance. */
export function interetAvance(miseAmount: number, nbMois: number): number {
  return Math.floor(miseAmount / 2) * nbMois;
}

export interface DemandeAvance {
  creditAutorise: boolean;
  avancesExistantes: number;
  maxAvances: number;
  misesParMois: number;
  miseAmount: number;
  nbMois: number;
  montant: number;
}

export type ResultatValidation = { ok: true } | { ok: false; raison: string };

/** Valide une demande d'avance ; renvoie la raison du refus le cas échéant. */
export function validerAvance(d: DemandeAvance): ResultatValidation {
  if (!d.creditAutorise) {
    return { ok: false, raison: 'Crédit non autorisé pour ce contrat' };
  }
  if (d.avancesExistantes >= d.maxAvances) {
    return { ok: false, raison: "Nombre maximum d'avances atteint" };
  }
  if (
    !Number.isInteger(d.nbMois) ||
    d.nbMois < 1 ||
    d.nbMois > MAX_MOIS_AVANCE
  ) {
    return { ok: false, raison: 'Nombre de mois invalide (1 à 3)' };
  }
  if (d.montant <= 0) {
    return { ok: false, raison: 'Montant invalide' };
  }
  const plafond = plafondAvance(d.misesParMois, d.miseAmount, d.nbMois);
  if (d.montant > plafond) {
    return {
      ok: false,
      raison: `Montant au-delà du plafond (${plafond} FCFA)`,
    };
  }
  return { ok: true };
}
