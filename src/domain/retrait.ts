/**
 * Retrait (R9) : le membre récupère son solde, net de la commission due, de l'intérêt
 * dû et de l'avance restant à rembourser. Le net ne peut pas être négatif.
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
