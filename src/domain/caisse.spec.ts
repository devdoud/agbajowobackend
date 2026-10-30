import {
  bornesJour,
  calculerRapportCaisse,
  estJourValide,
  jourBenin,
  regrouperReceptionsTardives,
  trierLignes,
  type LigneCaisse,
} from './caisse';

function ligne(opts: Partial<LigneCaisse> = {}): LigneCaisse {
  return {
    id: 'a',
    type: 'VERSEMENT',
    montant: 500,
    dateTerrain: new Date('2026-10-29T10:00:00Z'),
    recuServeurA: new Date('2026-10-29T10:00:00Z'),
    ...opts,
  };
}

describe('jourBenin', () => {
  it('passe au jour suivant à 23:00 UTC pile', () => {
    expect(jourBenin(new Date('2026-10-28T22:59:59.999Z'))).toBe('2026-10-28');
    expect(jourBenin(new Date('2026-10-28T23:00:00Z'))).toBe('2026-10-29');
  });

  it('change d’année au 31 décembre 23:00 UTC', () => {
    expect(jourBenin(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});

describe('estJourValide', () => {
  it('accepte une vraie date, y compris le 29 février bissextile', () => {
    expect(estJourValide('2026-10-29')).toBe(true);
    expect(estJourValide('2028-02-29')).toBe(true);
  });

  it('refuse un format faux ou une date qui n’existe pas', () => {
    expect(estJourValide('29-10-2026')).toBe(false);
    expect(estJourValide('2026-2-3')).toBe(false);
    expect(estJourValide('2026-02-30')).toBe(false);
    expect(estJourValide('2027-02-29')).toBe(false);
    expect(estJourValide('2026-13-01')).toBe(false);
  });
});

describe('bornesJour', () => {
  it('couvre de 23:00 UTC la veille à 23:00 UTC le jour même', () => {
    const { debut, fin } = bornesJour('2026-10-29');
    expect(debut.toISOString()).toBe('2026-10-28T23:00:00.000Z');
    expect(fin.toISOString()).toBe('2026-10-29T23:00:00.000Z');
  });

  it('traverse une fin de mois', () => {
    expect(bornesJour('2026-03-01').debut.toISOString()).toBe(
      '2026-02-28T23:00:00.000Z',
    );
  });

  it('contient toujours l’instant dont il est le jour du Bénin', () => {
    for (const iso of [
      '2026-10-28T22:59:59.999Z',
      '2026-10-28T23:00:00.000Z',
      '2026-12-31T23:30:00.000Z',
      '2028-02-28T23:15:00.000Z',
      '2026-06-15T12:00:00.000Z',
    ]) {
      const instant = new Date(iso);
      const { debut, fin } = bornesJour(jourBenin(instant));
      expect(debut.getTime()).toBeLessThanOrEqual(instant.getTime());
      expect(instant.getTime()).toBeLessThan(fin.getTime());
    }
  });

  it('lève une erreur sur un jour invalide', () => {
    expect(() => bornesJour('2026-02-30')).toThrow('Jour invalide');
  });
});

describe('trierLignes', () => {
  it('trie par date terrain, puis type, puis id, sans muter', () => {
    const t = new Date('2026-10-29T10:00:00Z');
    const lignes = [
      ligne({ id: 'r', type: 'RETRAIT', dateTerrain: t }),
      ligne({ id: 'v2', type: 'VERSEMENT', dateTerrain: t }),
      ligne({ id: 'v1', type: 'VERSEMENT', dateTerrain: t }),
      ligne({ id: 'tot', dateTerrain: new Date('2026-10-29T08:00:00Z') }),
    ];
    expect(trierLignes(lignes).map((l) => l.id)).toEqual([
      'tot',
      'v1',
      'v2',
      'r',
    ]);
    expect(lignes[0].id).toBe('r');
  });
});

describe('calculerRapportCaisse', () => {
  const fin = new Date('2026-10-29T23:00:00Z');

  it('encaissé moins avances et retraits nets donne le solde attendu', () => {
    const r = calculerRapportCaisse(
      [
        ligne({ montant: 1500 }),
        ligne({ montant: 1000 }),
        ligne({ type: 'AVANCE', montant: 600 }),
        ligne({ type: 'RETRAIT', montant: 400 }),
      ],
      fin,
    );
    expect(r.totaux).toEqual({
      encaisse: 2500,
      avances: 600,
      retraitsNets: 400,
      decaisse: 1000,
      soldeAttendu: 1500,
      nbMouvements: 4,
    });
    expect(r.soldeNegatif).toBe(false);
  });

  it('autorise un solde négatif et le signale', () => {
    const r = calculerRapportCaisse(
      [ligne({ type: 'RETRAIT', montant: 4500 })],
      fin,
    );
    expect(r.totaux.soldeAttendu).toBe(-4500);
    expect(r.soldeNegatif).toBe(true);
  });

  it('compte les lignes reçues à partir de la fin du jour comme tardives', () => {
    const r = calculerRapportCaisse(
      [
        ligne({ recuServeurA: new Date('2026-10-29T22:59:59Z') }),
        ligne({ recuServeurA: fin }),
        ligne({ recuServeurA: new Date('2026-10-31T08:00:00Z') }),
      ],
      fin,
    );
    expect(r.arriveesTardives).toBe(2);
  });

  it('rend des totaux à zéro sans mouvement', () => {
    const r = calculerRapportCaisse([], fin);
    expect(r.totaux.soldeAttendu).toBe(0);
    expect(r.totaux.nbMouvements).toBe(0);
    expect(r.soldeNegatif).toBe(false);
    expect(r.arriveesTardives).toBe(0);
  });
});

describe('regrouperReceptionsTardives', () => {
  // Jour D = 2026-10-29 au Bénin : commence le 28 à 23:00 UTC.
  const debutD = new Date('2026-10-28T23:00:00Z');
  const recu = new Date('2026-10-29T10:00:00Z');

  it('regroupe par jour terrain passé, trié, avec l’effet de chaque jour (AC-13, AC-14)', () => {
    const r = regrouperReceptionsTardives(
      [
        ligne({
          id: 'a',
          type: 'AVANCE',
          montant: 600,
          dateTerrain: new Date('2026-10-28T10:00:00Z'),
          recuServeurA: recu,
        }),
        ligne({
          id: 'v1',
          montant: 1500,
          dateTerrain: new Date('2026-10-27T10:00:00Z'),
          recuServeurA: recu,
        }),
        ligne({
          id: 'v2',
          montant: 500,
          dateTerrain: new Date('2026-10-28T09:00:00Z'),
          recuServeurA: recu,
        }),
      ],
      debutD,
    );
    expect(r).toEqual({
      nbMouvements: 3,
      effetSolde: 1400,
      parJour: [
        {
          date: '2026-10-27',
          nbMouvements: 1,
          encaisse: 1500,
          avances: 0,
          retraitsNets: 0,
          decaisse: 0,
          effetSolde: 1500,
        },
        {
          date: '2026-10-28',
          nbMouvements: 2,
          encaisse: 500,
          avances: 600,
          retraitsNets: 0,
          decaisse: 600,
          effetSolde: -100,
        },
      ],
    });
  });

  it('donne un effet négatif pour un retrait reçu en retard (AC-14)', () => {
    const r = regrouperReceptionsTardives(
      [
        ligne({
          type: 'RETRAIT',
          montant: 1000,
          dateTerrain: new Date('2026-10-28T10:00:00Z'),
          recuServeurA: recu,
        }),
      ],
      debutD,
    );
    expect(r.effetSolde).toBe(-1000);
    expect(r.parJour[0].retraitsNets).toBe(1000);
  });

  it('ignore les lignes datées du jour D ou après, frontière du Bénin comprise (AC-13)', () => {
    const r = regrouperReceptionsTardives(
      [
        ligne({ id: 'minuitD', dateTerrain: debutD, recuServeurA: recu }),
        ligne({
          id: 'precoce',
          dateTerrain: new Date('2026-10-29T23:05:00Z'),
          recuServeurA: recu,
        }),
        ligne({
          id: 'veille',
          dateTerrain: new Date('2026-10-28T22:59:59Z'),
          recuServeurA: recu,
        }),
      ],
      debutD,
    );
    expect(r.nbMouvements).toBe(1);
    expect(r.parJour.map((j) => j.date)).toEqual(['2026-10-28']);
  });

  it('rend un résultat vide sans réception tardive (AC-14)', () => {
    expect(regrouperReceptionsTardives([], debutD)).toEqual({
      nbMouvements: 0,
      effetSolde: 0,
      parJour: [],
    });
  });
});
