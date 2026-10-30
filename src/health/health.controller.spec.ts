import type { Response } from 'express';
import { HealthController } from './health.controller';

function reponse() {
  return { status: jest.fn() } as unknown as Response & { status: jest.Mock };
}

describe('HealthController', () => {
  it('retourne un statut ok quand la base répond', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const controller = new HealthController(prisma as never);
    const res = reponse();

    const result = await controller.check(res);

    expect(result).toMatchObject({
      status: 'ok',
      service: 'agbajowo-api',
      database: 'ok',
    });
    expect(typeof result.uptime).toBe('number');
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('répond 503 quand la base est injoignable (spec 0004, AC-6)', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('connexion refusée')),
    };
    const controller = new HealthController(prisma as never);
    const res = reponse();

    const result = await controller.check(res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(result).toMatchObject({
      status: 'degrade',
      database: 'injoignable',
    });
  });
});
