/**
 * Retrait (R9) : le membre récupère son solde, net de la commission due, de l'intérêt
 * dû et de l'avance restant à rembourser. Le net ne peut pas être négatif.
 * La commission (et l'intérêt) restant dus sont prélevés EN PRIORITÉ sur les cotisations
 * (R2/R9) : le membre ne reçoit que ce qui dépasse — pour un retrait total comme partiel.
 */

export interface ComposantesRetrait {
  soldeBrut: number;
  commissionDue: number;
  interetDu: number;
  avanceRestante: number;
}

export interface ResultatRetrait {
  montantNet: number;
  commissionPrelevee: number;
  interetDu: number;
  avanceRestante: number;
}

export function calculRetraitNet(c: ComposantesRetrait): ResultatRetrait {
  const net = c.soldeBrut - c.commissionDue - c.interetDu - c.avanceRestante;
  return {
    montantNet: Math.max(0, net),
    commissionPrelevee: c.commissionDue,
    interetDu: c.interetDu,
    avanceRestante: c.avanceRestante,
  };
}

/** État courant du contrat au moment d'un retrait. */
export interface EtatRetrait {
  brutDisponible: number; // cotisations non encore retirées
  commissionRestante: number; // commission due non encore prélevée
  interetRestant: number; // intérêt dû non encore prélevé
  avanceRestante: number; // avance restant à rembourser
}

export interface OperationRetrait {
  montantBrut: number;
  montantNet: number;
  commissionPrelevee: number;
  interetPreleve: number;
}

/** Montant net que le membre peut récupérer maintenant (jamais négatif). */
export function recuperableNet(e: EtatRetrait): number {
  return Math.max(
    0,
    e.brutDisponible -
      e.commissionRestante -
      e.interetRestant -
      e.avanceRestante,
  );
}

/** Retrait TOTAL : vide les cotisations disponibles et solde commission + intérêt restants. */
export function calculerRetraitTotal(e: EtatRetrait): OperationRetrait {
  return {
    montantBrut: e.brutDisponible,
    montantNet: recuperableNet(e),
    commissionPrelevee: e.commissionRestante,
    interetPreleve: e.interetRestant,
  };
}

/**
 * Retrait PARTIEL : le membre reçoit `montantNetDemande`. La commission et l'intérêt
 * restants sont prélevés en priorité (une seule fois) ; le net demandé ne doit pas
 * dépasser `recuperableNet` (à valider par l'appelant).
 */
export function calculerRetraitPartiel(
  e: EtatRetrait,
  montantNetDemande: number,
): OperationRetrait {
  return {
    montantBrut: montantNetDemande + e.commissionRestante + e.interetRestant,
    montantNet: montantNetDemande,
    commissionPrelevee: e.commissionRestante,
    interetPreleve: e.interetRestant,
  };
}
