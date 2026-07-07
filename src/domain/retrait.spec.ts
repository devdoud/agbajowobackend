import {
  calculRetraitNet,
  calculerRetraitPartiel,
  calculerRetraitTotal,
  recuperableNet,
} from './retrait';

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

describe('recuperableNet', () => {
  it('vaut 0 tant que la commission n’est pas couverte (G2 début de cycle)', () => {
    // 3 mises × 500 = 1500 cotisées, commission annuelle 1500
    expect(
      recuperableNet({
        brutDisponible: 1500,
        commissionRestante: 1500,
        interetRestant: 0,
        avanceRestante: 0,
      }),
    ).toBe(0);
  });

  it('rend ce qui dépasse la commission', () => {
    expect(
      recuperableNet({
        brutDisponible: 2000,
        commissionRestante: 1500,
        interetRestant: 0,
        avanceRestante: 0,
      }),
    ).toBe(500);
  });
});

describe('calculerRetraitTotal', () => {
  it('vide les cotisations et prélève la commission restante', () => {
    const r = calculerRetraitTotal({
      brutDisponible: 1500,
      commissionRestante: 1500,
      interetRestant: 0,
      avanceRestante: 0,
    });
    expect(r.montantBrut).toBe(1500);
    expect(r.montantNet).toBe(0);
    expect(r.commissionPrelevee).toBe(1500);
  });
});

describe('calculerRetraitPartiel', () => {
  it('prélève la commission restante en priorité (brut = net + commission)', () => {
    const r = calculerRetraitPartiel(
      {
        brutDisponible: 3000,
        commissionRestante: 1500,
        interetRestant: 0,
        avanceRestante: 0,
      },
      1000,
    );
    expect(r.montantNet).toBe(1000);
    expect(r.commissionPrelevee).toBe(1500);
    expect(r.montantBrut).toBe(2500);
  });

  it('ne reprélève pas une commission déjà prélevée', () => {
    const r = calculerRetraitPartiel(
      {
        brutDisponible: 2000,
        commissionRestante: 0,
        interetRestant: 0,
        avanceRestante: 0,
      },
      500,
    );
    expect(r.montantNet).toBe(500);
    expect(r.commissionPrelevee).toBe(0);
    expect(r.montantBrut).toBe(500);
  });
});
