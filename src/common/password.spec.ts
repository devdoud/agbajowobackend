import { genererMotDePasse } from './password';

describe('genererMotDePasse', () => {
  it('produit le format XXXX-XXXX-XXXX sans caractères ambigus', () => {
    for (let i = 0; i < 200; i++) {
      const mdp = genererMotDePasse();
      expect(mdp).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(mdp).not.toMatch(/[01OIl]/);
    }
  });

  it('génère des valeurs distinctes', () => {
    const set = new Set(Array.from({ length: 50 }, () => genererMotDePasse()));
    expect(set.size).toBeGreaterThan(45);
  });
});
