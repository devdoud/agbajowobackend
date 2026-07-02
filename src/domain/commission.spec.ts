import { commissionDue, moisEntames, ParamsCommission } from './commission';

const G1: ParamsCommission = {
  misesParMois: 31,
  moisParCycle: 12,
  miseAmount: 1000,
  commissionParMois: 1,
  commissionParCycle: null,
};

const G2: ParamsCommission = {
  misesParMois: 8,
  moisParCycle: 12,
  miseAmount: 500,
  commissionParMois: null,
  commissionParCycle: 3,
};

describe('moisEntames', () => {
  it('vaut 0 sans mise', () => {
    expect(moisEntames(0, 31, 12)).toBe(0);
  });
  it('compte le mois dès la première mise (mois incomplet compris)', () => {
    expect(moisEntames(1, 31, 12)).toBe(1);
    expect(moisEntames(31, 31, 12)).toBe(1);
    expect(moisEntames(32, 31, 12)).toBe(2);
  });
  it('est plafonné au nombre de mois du cycle', () => {
    expect(moisEntames(400, 31, 12)).toBe(12);
  });
});

describe('commissionDue — Groupe 1 (1 mise/mois entamé)', () => {
  it('0 sans versement', () => {
    expect(commissionDue(G1, 0)).toBe(0);
  });
  it('1 mise pour un mois entamé', () => {
    expect(commissionDue(G1, 1)).toBe(1000);
    expect(commissionDue(G1, 31)).toBe(1000);
  });
  it('2 mises dès qu’un 2e mois est entamé', () => {
    expect(commissionDue(G1, 32)).toBe(2000);
  });
  it('plafonnée à 12 mises sur le cycle', () => {
    expect(commissionDue(G1, 372)).toBe(12000);
  });
});

describe('commissionDue — Groupe 2 (3 mises/an)', () => {
  it('0 sans versement', () => {
    expect(commissionDue(G2, 0)).toBe(0);
  });
  it('3 mises dès le cycle entamé, quel que soit l’avancement', () => {
    expect(commissionDue(G2, 1)).toBe(1500);
    expect(commissionDue(G2, 50)).toBe(1500);
    expect(commissionDue(G2, 96)).toBe(1500);
  });
});

describe('commissionDue — configuration sans commission', () => {
  it('retourne 0 si aucun barème de commission n’est défini', () => {
    const sansCommission: ParamsCommission = {
      misesParMois: 10,
      moisParCycle: 12,
      miseAmount: 1000,
      commissionParMois: null,
      commissionParCycle: null,
    };
    expect(commissionDue(sansCommission, 100)).toBe(0);
  });
});
