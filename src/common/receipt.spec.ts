import { prochainRecu } from './receipt';

function transaction(nextval: bigint) {
  return { $queryRaw: jest.fn().mockResolvedValue([{ nextval }]) } as never;
}

describe('prochainRecu', () => {
  it('numérote le reçu à partir de la séquence, sur 5 chiffres', async () => {
    const recu = await prochainRecu(
      transaction(42n),
      new Date('2026-10-29T10:00:00Z'),
    );

    expect(recu).toBe('REC-20261029-00042');
  });

  it('date le reçu au jour du Bénin, même à 00:30 sur un serveur en UTC (spec 0004, AC-8)', async () => {
    // 2026-10-28T23:30Z = 29 octobre, 00:30 au Bénin.
    const recu = await prochainRecu(
      transaction(7n),
      new Date('2026-10-28T23:30:00Z'),
    );

    expect(recu).toBe('REC-20261029-00007');
  });
});
