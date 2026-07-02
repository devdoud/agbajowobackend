/** Helpers de dates purs et déterministes (aucun appel à `new Date()` implicite). */

const MS_PAR_JOUR = 86_400_000;

/** Ramène une date au début du jour (00:00:00.000), sans muter l'entrée. */
export function debutDeJour(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Nombre de jours calendaires entiers entre deux dates (peut être négatif). */
export function joursEntre(depuis: Date, jusqua: Date): number {
  return Math.floor(
    (debutDeJour(jusqua).getTime() - debutDeJour(depuis).getTime()) /
      MS_PAR_JOUR,
  );
}

/** Ajoute (ou retire) des jours à une date, sans muter l'entrée. */
export function ajouterJours(date: Date, jours: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + jours);
  return d;
}
