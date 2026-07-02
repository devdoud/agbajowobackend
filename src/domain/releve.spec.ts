import { montantNetAVirer, releveDePeriode } from './releve';

describe('montantNetAVirer', () => {
  it('applique la formule du livret', () => {
    expect(
      montantNetAVirer({
        totalCotisation: 31000,
        commission: 1000,
        avanceImputee: 0,
        interet: 0,
      }),
    ).toBe(30000);
  });

  it('déduit avance et intérêt', () => {
    expect(
      montantNetAVirer({
        totalCotisation: 30000,
        commission: 1000,
        avanceImputee: 24000,
        interet: 500,
      }),
    ).toBe(4500);
  });
});

describe('releveDePeriode', () => {
  it('retourne les composantes et le net', () => {
    const r = releveDePeriode({
      totalCotisation: 4000,
      commission: 500,
      avanceImputee: 0,
      interet: 0,
    });
    expect(r).toEqual({
      totalCotisation: 4000,
      commission: 500,
      avanceImputee: 0,
      interet: 0,
      montantNetAVirer: 3500,
    });
  });
});
