import { dateEcheance, parametresGroupe } from './parametres-groupe';
import { joursEntre } from './dates';

describe('parametresGroupe', () => {
  it('Groupe 1 : journalier, 31 mises/mois, 372 au total, commission mensuelle', () => {
    const p = parametresGroupe('GROUPE_1');
    expect(p.cadence).toBe('QUOTIDIENNE');
    expect(p.misesParMois).toBe(31);
    expect(p.targetMises).toBe(372);
    expect(p.commissionParMois).toBe(1);
    expect(p.commissionParCycle).toBeNull();
  });

  it('Groupe 2 : tous les 5 jours, 8 mises/mois, 96 au total, commission annuelle', () => {
    const p = parametresGroupe('GROUPE_2');
    expect(p.cadence).toBe('TOUS_LES_N_JOURS');
    expect(p.intervalleJours).toBe(5);
    expect(p.targetMises).toBe(96);
    expect(p.commissionParCycle).toBe(3);
    expect(p.commissionParMois).toBeNull();
  });
});

describe('dateEcheance', () => {
  const start = new Date('2026-01-01T00:00:00');

  it('G1 : 372 jours après le début', () => {
    const fin = dateEcheance(start, parametresGroupe('GROUPE_1'));
    expect(joursEntre(start, fin)).toBe(372);
  });

  it('G2 : 480 jours après le début (96 × 5)', () => {
    const fin = dateEcheance(start, parametresGroupe('GROUPE_2'));
    expect(joursEntre(start, fin)).toBe(480);
  });
});
