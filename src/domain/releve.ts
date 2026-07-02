/**
 * Relevé de période (règlement du livret) :
 *   Total cotisation − commission − avance imputée − intérêt = montant net à virer.
 * Mensuel pour le Groupe 1, annuel pour le Groupe 2.
 */

export interface ComposantesReleve {
  totalCotisation: number;
  commission: number;
  avanceImputee: number;
  interet: number;
}

export interface Releve extends ComposantesReleve {
  montantNetAVirer: number;
}

export function montantNetAVirer(c: ComposantesReleve): number {
  return c.totalCotisation - c.commission - c.avanceImputee - c.interet;
}

export function releveDePeriode(c: ComposantesReleve): Releve {
  return { ...c, montantNetAVirer: montantNetAVirer(c) };
}
