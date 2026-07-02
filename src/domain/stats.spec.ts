import { statsCollecte } from './stats';

describe('statsCollecte', () => {
  it('agrège une file vide', () => {
    expect(statsCollecte([])).toEqual({
      totalCollecte: 0,
      nbPayes: 0,
      nbACollecter: 0,
      nbEnRetard: 0,
      nbTermines: 0,
      nbActifs: 0,
    });
  });

  it('compte par statut et somme les soldes', () => {
    const stats = statsCollecte([
      { statutCollecte: 'paye', soldeBrut: 1000 },
      { statutCollecte: 'a_collecter', soldeBrut: 2000 },
      { statutCollecte: 'en_retard', soldeBrut: 500 },
      { statutCollecte: 'termine', soldeBrut: 3000 },
      { statutCollecte: 'paye', soldeBrut: 1500 },
    ]);
    expect(stats).toEqual({
      totalCollecte: 8000,
      nbPayes: 2,
      nbACollecter: 1,
      nbEnRetard: 1,
      nbTermines: 1,
      nbActifs: 4,
    });
  });
});
