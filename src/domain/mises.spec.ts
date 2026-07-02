import { moisDeMise, plageMises } from './mises';

describe('plageMises', () => {
  it('calcule la plage à partir des mises déjà versées', () => {
    expect(plageMises(0, 1)).toEqual({ debut: 1, fin: 1 });
    expect(plageMises(4, 3)).toEqual({ debut: 5, fin: 7 });
  });

  it('rejette un misesCount non positif ou non entier', () => {
    expect(() => plageMises(0, 0)).toThrow();
    expect(() => plageMises(0, -2)).toThrow();
    expect(() => plageMises(0, 1.5)).toThrow();
  });

  it('rejette un misesDejaVersees négatif', () => {
    expect(() => plageMises(-1, 1)).toThrow();
  });
});

describe('moisDeMise', () => {
  it('mappe une position vers son bloc-mois (G1 = 31/mois)', () => {
    expect(moisDeMise(1, 31)).toBe(1);
    expect(moisDeMise(31, 31)).toBe(1);
    expect(moisDeMise(32, 31)).toBe(2);
    expect(moisDeMise(372, 31)).toBe(12);
  });

  it('mappe une position vers son bloc-mois (G2 = 8/mois)', () => {
    expect(moisDeMise(8, 8)).toBe(1);
    expect(moisDeMise(9, 8)).toBe(2);
    expect(moisDeMise(96, 8)).toBe(12);
  });

  it('rejette des entrées invalides', () => {
    expect(() => moisDeMise(0, 31)).toThrow();
    expect(() => moisDeMise(1, 0)).toThrow();
  });
});
