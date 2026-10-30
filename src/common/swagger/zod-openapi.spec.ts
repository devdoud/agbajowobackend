import { encaisserSchema } from '@/modules/collecte/dto/encaisser.dto';
import { effectuerRetraitSchema } from '@/modules/retraits/dto/effectuer-retrait.dto';
import { pushSchema } from '@/modules/sync/dto/push.dto';
import { versOpenApi } from './zod-openapi';

interface Objet {
  type?: string;
  format?: string;
  description?: string;
  required?: string[];
  properties: Record<string, Objet & { items?: Objet; enum?: string[] }>;
}

describe('versOpenApi', () => {
  it('décrit le corps d’un encaissement à partir de son schéma Zod', () => {
    const s = versOpenApi(encaisserSchema) as Objet;

    expect(s.type).toBe('object');
    expect(s.required).toEqual(['contratId', 'misesCount']);
    expect(s.properties.contratId).toMatchObject({
      type: 'string',
      format: 'uuid',
    });
    expect(s.properties.misesCount.type).toBe('integer');
    expect(s).not.toHaveProperty('$schema');
  });

  it('montre la date terrain comme une chaîne date-time, malgré le z.unknown() transformé', () => {
    const s = versOpenApi(encaisserSchema) as Objet;

    expect(s.properties.paidAt).toMatchObject({
      type: 'string',
      format: 'date-time',
      example: '2026-10-29T22:30:00Z',
    });
  });

  it('montre aussi la date terrain obligatoire de la synchro', () => {
    const s = versOpenApi(pushSchema) as Objet;
    const versement = s.properties.versements.items as Objet;

    expect(versement.properties.paidAt).toMatchObject({
      type: 'string',
      format: 'date-time',
    });
    expect(versement.properties.paidAt.description).toMatch(/obligatoire/);
  });

  it('garde les valeurs énumérées (type de retrait)', () => {
    const s = versOpenApi(effectuerRetraitSchema) as Objet;

    expect(s.properties.type.enum).toEqual(['PARTIEL', 'TOTAL']);
  });
});
