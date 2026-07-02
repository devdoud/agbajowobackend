import { calculRetraitNet } from './retrait';

describe('calculRetraitNet', () => {
  it('déduit commission, intérêt et avance restante du brut', () => {
    const r = calculRetraitNet({
      soldeBrut: 30000,
      commissionDue: 1000,
      interetDu: 500,
      avanceRestante: 24000,
    });
    expect(r.montantNet).toBe(4500);
    expect(r.commissionPrelevee).toBe(1000);
  });

  it('retourne le brut moins la commission quand rien d’autre', () => {
    expect(
      calculRetraitNet({
        soldeBrut: 10000,
        commissionDue: 1000,
        interetDu: 0,
        avanceRestante: 0,
      }).montantNet,
    ).toBe(9000);
  });

  it('ne descend jamais sous zéro', () => {
    expect(
      calculRetraitNet({
        soldeBrut: 1000,
        commissionDue: 1000,
        interetDu: 500,
        avanceRestante: 0,
      }).montantNet,
    ).toBe(0);
  });
});
