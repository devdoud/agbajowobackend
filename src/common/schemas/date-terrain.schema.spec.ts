import { z } from 'zod';
import { RAISONS_DATE_TERRAIN } from '@/domain/date-terrain';
import { dateTerrainSchema } from './date-terrain.schema';

/** Comme dans les DTO directs : la date terrain est facultative. */
const schema = z.object({ paidAt: dateTerrainSchema.optional() });

describe('dateTerrainSchema', () => {
  it('laisse passer une date absente (le service prendra l’heure du serveur, AC-2)', () => {
    expect(schema.parse({})).toEqual({});
  });

  it('convertit une chaîne ISO avec fuseau en Date au bon instant (AC-9)', () => {
    const { paidAt } = schema.parse({ paidAt: '2026-10-28T23:30:00+01:00' });
    expect(paidAt).toBeInstanceOf(Date);
    expect(paidAt?.toISOString()).toBe('2026-10-28T22:30:00.000Z');
  });

  it.each([null, '2026-10-29T23:30:00', 1730000000000])(
    'refuse %p avec le message du spec (AC-1, AC-11)',
    (paidAt) => {
      const resultat = schema.safeParse({ paidAt });
      expect(resultat.success).toBe(false);
      expect(resultat.error?.issues).toEqual([
        expect.objectContaining({
          path: ['paidAt'],
          message: RAISONS_DATE_TERRAIN.invalide,
        }),
      ]);
    },
  );
});
