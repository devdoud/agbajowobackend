import {
  interetAvance,
  montantAttenduMensuel,
  plafondAvance,
  validerAvance,
  DemandeAvance,
} from './credit';

describe('montantAttenduMensuel', () => {
  it('G1 : 31 × 1000 = 31000', () => {
    expect(montantAttenduMensuel(31, 1000)).toBe(31000);
  });
});

describe('plafondAvance', () => {
  it('⅘ du mensuel attendu pour 1 mois', () => {
    // 4/5 × 31000 = 24800
    expect(plafondAvance(31, 1000, 1)).toBe(24800);
  });
  it('proportionnel au nombre de mois', () => {
    expect(plafondAvance(31, 1000, 3)).toBe(74400);
  });
});

describe('interetAvance', () => {
  it('mise ÷ 2 par mois (ex. 1000 → 500/mois)', () => {
    expect(interetAvance(1000, 1)).toBe(500);
    expect(interetAvance(1000, 3)).toBe(1500);
  });
});

describe('validerAvance', () => {
  const base: DemandeAvance = {
    creditAutorise: true,
    avancesExistantes: 0,
    maxAvances: 2,
    misesParMois: 31,
    miseAmount: 1000,
    nbMois: 1,
    montant: 24000,
  };

  it('accepte une demande valide sous le plafond', () => {
    expect(validerAvance(base)).toEqual({ ok: true });
  });
  it('refuse si le crédit n’est pas autorisé', () => {
    expect(validerAvance({ ...base, creditAutorise: false }).ok).toBe(false);
  });
  it('refuse si le nombre max d’avances est atteint', () => {
    expect(validerAvance({ ...base, avancesExistantes: 2 }).ok).toBe(false);
  });
  it('refuse un nombre de mois hors [1,3]', () => {
    expect(validerAvance({ ...base, nbMois: 0 }).ok).toBe(false);
    expect(validerAvance({ ...base, nbMois: 4 }).ok).toBe(false);
  });
  it('refuse un montant nul ou négatif', () => {
    expect(validerAvance({ ...base, montant: 0 }).ok).toBe(false);
  });
  it('refuse un montant au-delà du plafond', () => {
    expect(validerAvance({ ...base, montant: 25000 }).ok).toBe(false);
  });
});
