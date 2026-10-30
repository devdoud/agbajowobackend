import {
  RAISONS_DATE_TERRAIN,
  lireDateTerrain,
  verifierBornesDateTerrain,
} from './date-terrain';

function lu(valeur: unknown): string {
  const r = lireDateTerrain(valeur);
  if (!r.ok) throw new Error(`refusé : ${r.raison}`);
  return r.date.toISOString();
}

describe('lireDateTerrain', () => {
  it.each([
    ['2026-10-29T22:30:00Z', '2026-10-29T22:30:00.000Z'],
    ['2026-10-29T22:30:00.123Z', '2026-10-29T22:30:00.123Z'],
    ['2026-10-29T22:30:00.123456789Z', '2026-10-29T22:30:00.123Z'],
    ['2026-10-29T22:30:00.5Z', '2026-10-29T22:30:00.500Z'],
    ['2026-10-29T22:30Z', '2026-10-29T22:30:00.000Z'],
    ['2026-10-29T23:30:00+01:00', '2026-10-29T22:30:00.000Z'],
    ['2026-10-29T22:30:00+00:00', '2026-10-29T22:30:00.000Z'],
    ['2026-10-29T20:00:00-02:30', '2026-10-29T22:30:00.000Z'],
    ['2028-02-29T10:00:00Z', '2028-02-29T10:00:00.000Z'],
  ])('accepte « %s » et garde son instant exact (AC-1, AC-9)', (brut, iso) => {
    expect(lu(brut)).toBe(iso);
  });

  it('signale une date absente comme manquante (AC-7)', () => {
    expect(lireDateTerrain(undefined)).toEqual({
      ok: false,
      raison: RAISONS_DATE_TERRAIN.manquante,
    });
  });

  it.each([
    null,
    1730000000000,
    new Date('2026-10-29T22:30:00Z'),
    '',
    '2026-10-29',
    '2026-10-29T23:30:00',
    '2026-10-29T22:30:00z',
    '2026-10-29T22:30:00-00:00',
    '2026-10-29 22:30:00Z',
    '2026-02-30T10:00:00Z',
    '2027-02-29T10:00:00Z',
    '2026-04-31T10:00:00Z',
    '2026-13-01T10:00:00Z',
    '2026-00-10T10:00:00Z',
    '2026-10-29T24:00:00Z',
    '2026-10-29T23:60:00Z',
    '2026-10-29T23:59:60Z',
    '2026-10-29T10:00:00+99:00',
    '2026-10-29T10:00:00+15:00',
    '2026-10-29T10:00:00+01:60',
    '2026-10-29T22:30:00.1234567890Z',
  ])('refuse %p comme invalide (AC-1)', (valeur) => {
    expect(lireDateTerrain(valeur)).toEqual({
      ok: false,
      raison: RAISONS_DATE_TERRAIN.invalide,
    });
  });

  it("garde l'année 0000 comme l'an 0, pour que les bornes la refusent", () => {
    const r = lireDateTerrain('0000-01-01T00:00:00Z');
    expect(r.ok && r.date.getUTCFullYear()).toBe(0);
  });
});

describe('verifierBornesDateTerrain', () => {
  const maintenant = new Date('2026-10-29T12:00:00Z');
  const debut = new Date('2026-10-20T00:00:00Z'); // colonne @db.Date
  const verifier = (iso: string) =>
    verifierBornesDateTerrain(new Date(iso), maintenant, debut);

  it('accepte exactement 15 minutes dans le futur, refuse 1 ms de plus (AC-3)', () => {
    expect(verifier('2026-10-29T12:15:00.000Z')).toEqual({ ok: true });
    expect(verifier('2026-10-29T12:15:00.001Z')).toEqual({
      ok: false,
      raison: RAISONS_DATE_TERRAIN.futur,
    });
  });

  it('accepte exactement 30 jours avant, refuse 1 ms de plus (AC-4)', () => {
    const vieux = new Date('2026-09-01T00:00:00Z');
    const bornes = (iso: string) =>
      verifierBornesDateTerrain(new Date(iso), maintenant, vieux);
    expect(bornes('2026-09-29T12:00:00.000Z')).toEqual({ ok: true });
    expect(bornes('2026-09-29T11:59:59.999Z')).toEqual({
      ok: false,
      raison: RAISONS_DATE_TERRAIN.ancienne,
    });
  });

  it('refuse un jour du Bénin avant le début du contrat, avec la date de début (AC-5, AC-11)', () => {
    expect(verifier('2026-10-19T22:59:59Z')).toEqual({
      ok: false,
      raison: 'Date terrain avant le début du contrat (2026-10-20).',
    });
    // 23:00 UTC le 19 = minuit au Bénin le 20 : déjà dans le contrat.
    expect(verifier('2026-10-19T23:00:00Z')).toEqual({ ok: true });
  });

  it('refuse une date dans le futur avant de regarder le contrat', () => {
    expect(verifier('2027-01-01T00:00:00Z')).toEqual({
      ok: false,
      raison: RAISONS_DATE_TERRAIN.futur,
    });
  });
});

describe('RAISONS_DATE_TERRAIN', () => {
  it('donne exactement les messages du spec (AC-11)', () => {
    expect(RAISONS_DATE_TERRAIN.futur).toBe(
      "Date terrain dans le futur : au plus 15 minutes après l'heure du serveur.",
    );
    expect(RAISONS_DATE_TERRAIN.ancienne).toBe(
      "Date terrain trop ancienne : au plus 30 jours avant l'heure du serveur.",
    );
  });
});
