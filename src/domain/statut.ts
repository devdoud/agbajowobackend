import { debutDeJour, joursEntre } from './dates';
import type { Cadence, StatutCollecte } from './types';

/**
 * Nombre de points de collecte échus entre `startDate` et `dateRef` (inclus).
 *  - QUOTIDIENNE : un point par jour.
 *  - TOUS_LES_N_JOURS : un point tous les `intervalleJours` jours.
 * 0 si `dateRef` précède `startDate`.
 */
export function pointsDeCollecte(
  startDate: Date,
  dateRef: Date,
  cadence: Cadence,
  intervalleJours: number | null,
): number {
  const jours = joursEntre(startDate, dateRef);
  if (jours < 0) return 0;
  const intervalle =
    cadence === 'TOUS_LES_N_JOURS' ? (intervalleJours ?? 1) : 1;
  return Math.floor(jours / intervalle) + 1;
}

export interface EntreeStatut {
  cadence: Cadence;
  intervalleJours: number | null;
  startDate: Date;
  misesVersees: number;
  targetMises: number;
  termine?: boolean;
}

/**
 * Statut de collecte à une date donnée, **selon la cadence** (R3).
 * `termine` si l'objectif est atteint ; sinon comparaison des mises versées aux
 * points de collecte échus.
 */
export function statutCollecte(e: EntreeStatut, dateRef: Date): StatutCollecte {
  if (e.termine || e.misesVersees >= e.targetMises) return 'termine';
  if (debutDeJour(dateRef) < debutDeJour(e.startDate)) return 'a_collecter';

  const attendus = Math.min(
    e.targetMises,
    pointsDeCollecte(e.startDate, dateRef, e.cadence, e.intervalleJours),
  );
  if (e.misesVersees >= attendus) return 'paye';
  if (e.misesVersees === attendus - 1) return 'a_collecter';
  return 'en_retard';
}
