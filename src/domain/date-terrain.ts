/**
 * Date terrain d'un mouvement (spec 0003) : le moment où l'argent a changé de mains,
 * envoyé par le téléphone. Elle décide du jour où le mouvement compte dans le
 * rapport de caisse, donc elle doit être lisible sans ambiguïté et plausible.
 *  - Format : ISO 8601 avec heure et fuseau explicite (`Z` ou `±hh:mm`).
 *  - Bornes : au plus 15 min après l'heure du serveur, au plus 30 jours avant,
 *    et pas avant le jour de début du contrat (jour du Bénin).
 */
import { jourBenin } from './caisse';

export const TOLERANCE_FUTUR_MINUTES = 15;
export const ANCIENNETE_MAX_JOURS = 30;

const MS_PAR_MINUTE = 60_000;
const MS_PAR_JOUR = 86_400_000;
const DECALAGE_MAX_HEURES = 14;

export const FORMAT_DATE_TERRAIN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|([+-])(\d{2}):(\d{2}))$/;

export const RAISONS_DATE_TERRAIN = {
  manquante: 'Date terrain manquante.',
  invalide:
    'Date terrain invalide : format ISO 8601 avec fuseau attendu (ex. 2026-10-29T22:30:00Z).',
  futur: `Date terrain dans le futur : au plus ${TOLERANCE_FUTUR_MINUTES} minutes après l'heure du serveur.`,
  ancienne: `Date terrain trop ancienne : au plus ${ANCIENNETE_MAX_JOURS} jours avant l'heure du serveur.`,
  avantContrat: (debut: string) =>
    `Date terrain avant le début du contrat (${debut}).`,
};

export type LectureDateTerrain =
  | { ok: true; date: Date }
  | { ok: false; raison: string };

export type BornesDateTerrain = { ok: true } | { ok: false; raison: string };

function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

function joursDansMois(annee: number, mois: number): number {
  if (mois === 2) return estBissextile(annee) ? 29 : 28;
  return [4, 6, 9, 11].includes(mois) ? 30 : 31;
}

/**
 * Lit une date terrain brute. Les morceaux sont contrôlés un par un (jamais en
 * relisant un `Date`, qu'un décalage `+01:00` décalerait) ; l'instant est calculé
 * en UTC moins le décalage, la fraction tronquée à la milliseconde.
 */
export function lireDateTerrain(valeur: unknown): LectureDateTerrain {
  const invalide = {
    ok: false,
    raison: RAISONS_DATE_TERRAIN.invalide,
  } as const;
  if (valeur === undefined) {
    return { ok: false, raison: RAISONS_DATE_TERRAIN.manquante };
  }
  if (typeof valeur !== 'string') return invalide;
  const m = FORMAT_DATE_TERRAIN.exec(valeur);
  if (!m) return invalide;

  const [annee, mois, jour, heure, minute] = [m[1], m[2], m[3], m[4], m[5]].map(
    Number,
  );
  const seconde = m[6] === undefined ? 0 : Number(m[6]);
  const ms = Number((m[7] ?? '').padEnd(3, '0').slice(0, 3));
  if (mois < 1 || mois > 12) return invalide;
  if (jour < 1 || jour > joursDansMois(annee, mois)) return invalide;
  if (heure > 23 || minute > 59 || seconde > 59) return invalide;

  let decalageMinutes = 0;
  if (m[8] !== 'Z') {
    const [signe, hh, mm] = [m[9], Number(m[10]), Number(m[11])];
    if (hh > DECALAGE_MAX_HEURES || mm > 59) return invalide;
    // `-00:00` veut dire « décalage inconnu » (RFC 3339) : refusé.
    if (signe === '-' && hh === 0 && mm === 0) return invalide;
    decalageMinutes = (signe === '+' ? 1 : -1) * (hh * 60 + mm);
  }

  // `Date.UTC` lirait les années 0 à 99 comme 1900 à 1999 : on pose l'année à part.
  const date = new Date(0);
  date.setUTCFullYear(annee, mois - 1, jour);
  date.setUTCHours(heure, minute, seconde, ms);
  return {
    ok: true,
    date: new Date(date.getTime() - decalageMinutes * MS_PAR_MINUTE),
  };
}

/** Bornes incluses, comparées en millisecondes ; `debutContrat` est une date calendaire. */
export function verifierBornesDateTerrain(
  date: Date,
  maintenant: Date,
  debutContrat: Date,
): BornesDateTerrain {
  const t = date.getTime();
  if (t > maintenant.getTime() + TOLERANCE_FUTUR_MINUTES * MS_PAR_MINUTE) {
    return { ok: false, raison: RAISONS_DATE_TERRAIN.futur };
  }
  if (t < maintenant.getTime() - ANCIENNETE_MAX_JOURS * MS_PAR_JOUR) {
    return { ok: false, raison: RAISONS_DATE_TERRAIN.ancienne };
  }
  const debut = debutContrat.toISOString().slice(0, 10);
  if (jourBenin(date) < debut) {
    return { ok: false, raison: RAISONS_DATE_TERRAIN.avantContrat(debut) };
  }
  return { ok: true };
}

/**
 * Écart d'horloge d'un téléphone (spec 0005) : `maintenant − horlogeClient`, en
 * millisecondes, lu au moment du push. Au-delà de la tolérance du futur, les dates
 * terrain du lot sont corrigées de cet écart ; en deçà, elles passent déjà les bornes
 * et on les garde telles quelles (renvoie `null`).
 */
export function ecartHorloge(
  horlogeClient: Date,
  maintenant: Date,
): number | null {
  const ecart = maintenant.getTime() - horlogeClient.getTime();
  return Math.abs(ecart) > TOLERANCE_FUTUR_MINUTES * MS_PAR_MINUTE
    ? ecart
    : null;
}

/** Date terrain ramenée à l'heure du serveur : `date + ecart`. */
export function corrigerDateTerrain(date: Date, ecartMs: number): Date {
  return new Date(date.getTime() + ecartMs);
}
