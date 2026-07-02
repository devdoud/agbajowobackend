import { pointsDeCollecte, statutCollecte, EntreeStatut } from './statut';

const d = (s: string) => new Date(`${s}T00:00:00`);

describe('pointsDeCollecte', () => {
  it('QUOTIDIENNE : un point par jour, 1 le jour de début', () => {
    expect(
      pointsDeCollecte(d('2026-01-01'), d('2026-01-01'), 'QUOTIDIENNE', null),
    ).toBe(1);
    expect(
      pointsDeCollecte(d('2026-01-01'), d('2026-01-10'), 'QUOTIDIENNE', null),
    ).toBe(10);
  });

  it('TOUS_LES_N_JOURS : un point tous les 5 jours', () => {
    expect(
      pointsDeCollecte(d('2026-01-01'), d('2026-01-01'), 'TOUS_LES_N_JOURS', 5),
    ).toBe(1);
    expect(
      pointsDeCollecte(d('2026-01-01'), d('2026-01-06'), 'TOUS_LES_N_JOURS', 5),
    ).toBe(2);
    expect(
      pointsDeCollecte(d('2026-01-01'), d('2026-01-05'), 'TOUS_LES_N_JOURS', 5),
    ).toBe(1);
  });

  it('0 avant la date de début', () => {
    expect(
      pointsDeCollecte(d('2026-01-10'), d('2026-01-01'), 'QUOTIDIENNE', null),
    ).toBe(0);
  });

  it('retombe sur un intervalle de 1 si intervalleJours est nul', () => {
    expect(
      pointsDeCollecte(
        d('2026-01-01'),
        d('2026-01-05'),
        'TOUS_LES_N_JOURS',
        null,
      ),
    ).toBe(5);
  });
});

describe('statutCollecte', () => {
  const g1: EntreeStatut = {
    cadence: 'QUOTIDIENNE',
    intervalleJours: null,
    startDate: d('2026-01-01'),
    misesVersees: 0,
    targetMises: 372,
  };

  it('termine quand l’objectif est atteint', () => {
    expect(statutCollecte({ ...g1, misesVersees: 372 }, d('2026-06-01'))).toBe(
      'termine',
    );
  });

  it('termine si le drapeau est posé', () => {
    expect(statutCollecte({ ...g1, termine: true }, d('2026-06-01'))).toBe(
      'termine',
    );
  });

  it('a_collecter avant la date de début', () => {
    expect(statutCollecte(g1, d('2025-12-20'))).toBe('a_collecter');
  });

  it('paye quand les mises couvrent les points échus', () => {
    // au 10e jour, 10 points échus ; 10 mises versées → à jour
    expect(statutCollecte({ ...g1, misesVersees: 10 }, d('2026-01-10'))).toBe(
      'paye',
    );
  });

  it('a_collecter quand il ne manque que le point du jour', () => {
    expect(statutCollecte({ ...g1, misesVersees: 9 }, d('2026-01-10'))).toBe(
      'a_collecter',
    );
  });

  it('en_retard quand il manque plus d’un point', () => {
    expect(statutCollecte({ ...g1, misesVersees: 5 }, d('2026-01-10'))).toBe(
      'en_retard',
    );
  });

  it('respecte la cadence tous les 5 jours (G2)', () => {
    const g2: EntreeStatut = {
      cadence: 'TOUS_LES_N_JOURS',
      intervalleJours: 5,
      startDate: d('2026-01-01'),
      misesVersees: 2,
      targetMises: 96,
    };
    // au 6e jour → 2 points échus, 2 mises → payé (les jours sans marché ne comptent pas)
    expect(statutCollecte(g2, d('2026-01-06'))).toBe('paye');
    // au 11e jour → 3 points échus, 2 mises → à collecter
    expect(statutCollecte(g2, d('2026-01-11'))).toBe('a_collecter');
  });
});
