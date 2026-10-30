/**
 * Rapport de caisse (spec 0002) : ce qu'un agent a encaissé et décaissé sur une
 * journée, et le solde qu'il doit remettre.
 *  - Le jour est celui du Bénin (UTC+1 fixe, sans heure d'été), jamais celui du serveur.
 *  - Encaissé = versements ; décaissé = principal des avances + net des retraits
 *    (commission et intérêt prélevés restent dans la caisse).
 *  - Le solde attendu peut être négatif : l'agent a payé plus qu'il n'a reçu.
 */

export const FUSEAU_CAISSE = 'Africa/Porto-Novo';
export const DECALAGE_BENIN_MINUTES = 60;

const MS_PAR_MINUTE = 60_000;
const MS_PAR_JOUR = 86_400_000;
const FORMAT_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

export type TypeMouvement = 'VERSEMENT' | 'AVANCE' | 'RETRAIT';

/** Ordre fixe des types, utilisé pour départager deux lignes à la même heure. */
const ORDRE_TYPE: Record<TypeMouvement, number> = {
  VERSEMENT: 0,
  AVANCE: 1,
  RETRAIT: 2,
};

/** Un mouvement d'argent vu par la caisse. `montant` : ce qui entre ou sort de la poche. */
export interface LigneCaisse {
  id: string;
  type: TypeMouvement;
  montant: number;
  dateTerrain: Date;
  recuServeurA: Date;
}

export interface TotauxCaisse {
  encaisse: number;
  avances: number;
  retraitsNets: number;
  decaisse: number;
  soldeAttendu: number;
  nbMouvements: number;
}

export interface RapportCaisse {
  totaux: TotauxCaisse;
  soldeNegatif: boolean;
  arriveesTardives: number;
}

/** Jour du Bénin (`YYYY-MM-DD`) d'un instant. */
export function jourBenin(instant: Date): string {
  const decale = new Date(
    instant.getTime() + DECALAGE_BENIN_MINUTES * MS_PAR_MINUTE,
  );
  return decale.toISOString().slice(0, 10);
}

/** Vrai si `jour` est au format `YYYY-MM-DD` et désigne une date qui existe. */
export function estJourValide(jour: string): boolean {
  const m = FORMAT_JOUR.exec(jour);
  if (!m) return false;
  const [annee, mois, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(annee, mois - 1, j));
  return (
    d.getUTCFullYear() === annee &&
    d.getUTCMonth() === mois - 1 &&
    d.getUTCDate() === j
  );
}

/** Bornes `[debut, fin[` d'un jour du Bénin, en instants UTC. */
export function bornesJour(jour: string): { debut: Date; fin: Date } {
  if (!estJourValide(jour)) throw new Error(`Jour invalide : « ${jour} ».`);
  const [annee, mois, j] = jour.split('-').map(Number);
  const debut = new Date(
    Date.UTC(annee, mois - 1, j) - DECALAGE_BENIN_MINUTES * MS_PAR_MINUTE,
  );
  return { debut, fin: new Date(debut.getTime() + MS_PAR_JOUR) };
}

/** Un mouvement est tardif si le serveur l'a reçu après la fin de son jour. */
export function estArriveeTardive(recuServeurA: Date, fin: Date): boolean {
  return recuServeurA.getTime() >= fin.getTime();
}

/** Ordre déterministe : date terrain, puis type, puis id. Ne mute pas l'entrée. */
export function trierLignes<T extends LigneCaisse>(lignes: T[]): T[] {
  return [...lignes].sort(
    (a, b) =>
      a.dateTerrain.getTime() - b.dateTerrain.getTime() ||
      ORDRE_TYPE[a.type] - ORDRE_TYPE[b.type] ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Effet d'une synchro tardive sur un jour terrain passé (spec 0002, AC-14). */
export interface JourReceptionTardive {
  date: string;
  nbMouvements: number;
  encaisse: number;
  avances: number;
  retraitsNets: number;
  decaisse: number;
  /** Positif : le solde attendu de ce jour a augmenté (l'agent devait plus). */
  effetSolde: number;
}

export interface ReceptionsTardives {
  nbMouvements: number;
  effetSolde: number;
  parJour: JourReceptionTardive[];
}

/**
 * Réceptions tardives du jour D (spec 0002, AC-13) : parmi les lignes reçues pendant
 * D, celles dont la date terrain tombe avant `debutD`, regroupées par jour terrain.
 * Chaque jour est calculé comme son propre rapport ; elles ne changent pas le jour D.
 */
export function regrouperReceptionsTardives(
  lignes: LigneCaisse[],
  debutD: Date,
): ReceptionsTardives {
  const parDate = new Map<string, LigneCaisse[]>();
  for (const ligne of lignes) {
    if (ligne.dateTerrain.getTime() >= debutD.getTime()) continue;
    const date = jourBenin(ligne.dateTerrain);
    parDate.set(date, [...(parDate.get(date) ?? []), ligne]);
  }
  const parJour = [...parDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, lignesDuJour]): JourReceptionTardive => {
      const { totaux } = calculerRapportCaisse(
        lignesDuJour,
        bornesJour(date).fin,
      );
      return {
        date,
        nbMouvements: totaux.nbMouvements,
        encaisse: totaux.encaisse,
        avances: totaux.avances,
        retraitsNets: totaux.retraitsNets,
        decaisse: totaux.decaisse,
        effetSolde: totaux.soldeAttendu,
      };
    });
  return {
    nbMouvements: parJour.reduce((n, j) => n + j.nbMouvements, 0),
    effetSolde: parJour.reduce((s, j) => s + j.effetSolde, 0),
    parJour,
  };
}

/** Totaux, solde et arrivées tardives, calculés sur les lignes mêmes du rapport. */
export function calculerRapportCaisse(
  lignes: LigneCaisse[],
  fin: Date,
): RapportCaisse {
  let encaisse = 0;
  let avances = 0;
  let retraitsNets = 0;
  let arriveesTardives = 0;
  for (const ligne of lignes) {
    if (ligne.type === 'VERSEMENT') encaisse += ligne.montant;
    else if (ligne.type === 'AVANCE') avances += ligne.montant;
    else retraitsNets += ligne.montant;
    if (estArriveeTardive(ligne.recuServeurA, fin)) arriveesTardives += 1;
  }
  const decaisse = avances + retraitsNets;
  const soldeAttendu = encaisse - decaisse;
  return {
    totaux: {
      encaisse,
      avances,
      retraitsNets,
      decaisse,
      soldeAttendu,
      nbMouvements: lignes.length,
    },
    soldeNegatif: soldeAttendu < 0,
    arriveesTardives,
  };
}

/** Un jour de la courbe du tableau de bord (spec 0005). Montants en FCFA. */
export interface PointSerie {
  date: string;
  encaisse: number;
  nbVersements: number;
  avances: number;
  retraitsNets: number;
}

/** Les `n` jours du Bénin qui finissent par `dernierJour` inclus, du plus ancien au plus récent. */
export function joursDeLaSerie(dernierJour: string, n: number): string[] {
  const { debut } = bornesJour(dernierJour);
  return Array.from({ length: n }, (_, i) =>
    jourBenin(new Date(debut.getTime() - (n - 1 - i) * MS_PAR_JOUR)),
  );
}

/** Un point par jour, à zéro les jours sans mouvement ; les jours inconnus sont ignorés. */
export function remplirSerie(
  jours: string[],
  sommes: Partial<Record<string, Partial<Omit<PointSerie, 'date'>>>>,
): PointSerie[] {
  return jours.map((date) => ({
    date,
    encaisse: sommes[date]?.encaisse ?? 0,
    nbVersements: sommes[date]?.nbVersements ?? 0,
    avances: sommes[date]?.avances ?? 0,
    retraitsNets: sommes[date]?.retraitsNets ?? 0,
  }));
}
