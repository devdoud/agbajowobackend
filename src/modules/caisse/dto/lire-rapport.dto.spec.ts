import { agentParamSchema, lireRapportSchema } from './lire-rapport.dto';

describe('lireRapportSchema', () => {
  it('accepte une requête sans date (aujourd’hui par défaut, AC-8)', () => {
    expect(lireRapportSchema.parse({})).toEqual({});
  });

  it('accepte une date qui existe', () => {
    expect(lireRapportSchema.parse({ date: '2028-02-29' })).toEqual({
      date: '2028-02-29',
    });
  });

  it.each(['2026-02-30', '29-10-2026', '2026-10-29T00:00:00Z', '', 'hier'])(
    'refuse la date « %s » (AC-8)',
    (date) => {
      expect(lireRapportSchema.safeParse({ date }).success).toBe(false);
    },
  );

  it('ignore un paramètre inconnu', () => {
    expect(lireRapportSchema.parse({ date: '2026-10-20', tri: 'nom' })).toEqual(
      { date: '2026-10-20' },
    );
  });
});

describe('agentParamSchema', () => {
  it('accepte un uuid', () => {
    const agentId = '9d507c51-861f-48d7-bed8-d83d1cefd04e';
    expect(agentParamSchema.parse({ agentId })).toEqual({ agentId });
  });

  it('refuse un identifiant qui n’est pas un uuid (AC-8)', () => {
    expect(agentParamSchema.safeParse({ agentId: '42' }).success).toBe(false);
  });
});
