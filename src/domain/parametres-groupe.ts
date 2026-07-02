import { ajouterJours } from './dates';
import type { Cadence, Groupe } from './types';

/** Paramètres figés d'un groupe, copiés sur le contrat à la souscription. */
export interface ParametresGroupe {
  cadence: Cadence;
  intervalleJours: number | null;
  moisParCycle: number;
  misesParMois: number;
  targetMises: number;
  commissionParMois: number | null;
  commissionParCycle: number | null;
  creditAutorise: boolean;
  maxAvances: number;
}

/**
 * Barèmes des deux groupes. Ajouter un « Groupe 3 » = ajouter une entrée ici,
 * sans toucher au reste du code (modèle paramétrique).
 */
export const PARAMETRES_GROUPE: Record<Groupe, ParametresGroupe> = {
  GROUPE_1: {
    cadence: 'QUOTIDIENNE',
    intervalleJours: null,
    moisParCycle: 12,
    misesParMois: 31,
    targetMises: 372,
    commissionParMois: 1,
    commissionParCycle: null,
    creditAutorise: true,
    maxAvances: 2,
  },
  GROUPE_2: {
    cadence: 'TOUS_LES_N_JOURS',
    intervalleJours: 5,
    moisParCycle: 12,
    misesParMois: 8,
    targetMises: 96,
    commissionParMois: null,
    commissionParCycle: 3,
    creditAutorise: true,
    maxAvances: 2,
  },
};

export function parametresGroupe(groupe: Groupe): ParametresGroupe {
  return PARAMETRES_GROUPE[groupe];
}

/**
 * Date d'échéance du contrat : `startDate` + (targetMises × intervalle).
 * G1 : 372 × 1 jour ; G2 : 96 × 5 jours.
 */
export function dateEcheance(startDate: Date, params: ParametresGroupe): Date {
  const intervalle = params.intervalleJours ?? 1;
  return ajouterJours(startDate, params.targetMises * intervalle);
}
