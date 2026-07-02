import type { StatutCollecte } from './types';

/** Un contrat vu par le tableau de bord (données déjà dérivées). */
export interface ElementCollecte {
  statutCollecte: StatutCollecte;
  soldeBrut: number;
}

export interface StatsCollecte {
  totalCollecte: number;
  nbPayes: number;
  nbACollecter: number;
  nbEnRetard: number;
  nbTermines: number;
  nbActifs: number;
}

/** Agrège la file de collecte pour le tableau de bord. */
export function statsCollecte(items: ElementCollecte[]): StatsCollecte {
  const stats: StatsCollecte = {
    totalCollecte: 0,
    nbPayes: 0,
    nbACollecter: 0,
    nbEnRetard: 0,
    nbTermines: 0,
    nbActifs: 0,
  };

  for (const item of items) {
    stats.totalCollecte += item.soldeBrut;
    switch (item.statutCollecte) {
      case 'paye':
        stats.nbPayes += 1;
        break;
      case 'a_collecter':
        stats.nbACollecter += 1;
        break;
      case 'en_retard':
        stats.nbEnRetard += 1;
        break;
      case 'termine':
        stats.nbTermines += 1;
        break;
    }
    if (item.statutCollecte !== 'termine') stats.nbActifs += 1;
  }

  return stats;
}
