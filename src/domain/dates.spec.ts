import { ajouterJours, debutDeJour, joursEntre } from './dates';

describe('debutDeJour', () => {
  it('ramène à minuit sans muter l’entrée', () => {
    const src = new Date('2026-03-15T14:30:00');
    const res = debutDeJour(src);
    expect(res.getHours()).toBe(0);
    expect(res.getMinutes()).toBe(0);
    expect(src.getHours()).toBe(14); // non muté
  });
});

describe('joursEntre', () => {
  it('compte les jours entiers (signé)', () => {
    expect(joursEntre(new Date('2026-01-01'), new Date('2026-01-11'))).toBe(10);
    expect(joursEntre(new Date('2026-01-11'), new Date('2026-01-01'))).toBe(
      -10,
    );
    expect(joursEntre(new Date('2026-01-01'), new Date('2026-01-01'))).toBe(0);
  });
});

describe('ajouterJours', () => {
  it('ajoute et retire des jours sans muter l’entrée', () => {
    const src = new Date('2026-01-01T00:00:00');
    expect(ajouterJours(src, 5).getDate()).toBe(6);
    expect(ajouterJours(src, -1).getMonth()).toBe(11); // 31 déc.
    expect(src.getDate()).toBe(1); // non muté
  });
});
