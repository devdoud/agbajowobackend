import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controller = new HealthController();

  it('retourne un statut ok', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('agbajowo-api');
    expect(typeof result.uptime).toBe('number');
    expect(() => new Date(result.timestamp)).not.toThrow();
  });
});
