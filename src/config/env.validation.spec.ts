import { validateEnv } from './env.validation';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'secret-acces-0123456789',
  JWT_REFRESH_SECRET: 'secret-refresh-0123456789',
};

const S3 = {
  S3_ENDPOINT: 'https://ref.supabase.co/storage/v1/s3',
  S3_REGION: 'eu-central-1',
  S3_BUCKET: 'photos',
  S3_ACCESS_KEY_ID: 'cle',
  S3_SECRET_ACCESS_KEY: 'secret',
};

describe('validateEnv (spec 0004)', () => {
  it('garde le comportement de dev par défaut', () => {
    const env = validateEnv(BASE);

    expect(env.MEDIA_DRIVER).toBe('disque');
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.CORS_ORIGIN).toBe('http://localhost:3000');
    expect(env.DIRECT_URL).toBeUndefined();
  });

  it('exige DIRECT_URL et CORS_ORIGIN en production', () => {
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(
      /DIRECT_URL[\s\S]*CORS_ORIGIN/,
    );
    const env = validateEnv({
      ...BASE,
      NODE_ENV: 'production',
      DIRECT_URL: 'postgresql://u:p@pooler:5432/db',
      CORS_ORIGIN: 'https://admin.exemple.bj',
    });
    expect(env.CORS_ORIGIN).toBe('https://admin.exemple.bj');
  });

  it('retire la barre oblique finale de CORS_ORIGIN', () => {
    const env = validateEnv({
      ...BASE,
      CORS_ORIGIN: 'https://agbajowo.vercel.app/',
    });
    expect(env.CORS_ORIGIN).toBe('https://agbajowo.vercel.app');
  });

  it('exige les cinq variables S3 avec MEDIA_DRIVER=s3', () => {
    const incomplet = { ...S3, S3_BUCKET: undefined };

    expect(() =>
      validateEnv({ ...BASE, MEDIA_DRIVER: 's3', ...incomplet }),
    ).toThrow(/S3_BUCKET/);
    expect(validateEnv({ ...BASE, MEDIA_DRIVER: 's3', ...S3 }).S3_BUCKET).toBe(
      'photos',
    );
  });

  it('lit TRUST_PROXY comme un nombre de sauts', () => {
    expect(validateEnv({ ...BASE, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(() => validateEnv({ ...BASE, TRUST_PROXY: '-1' })).toThrow(
      /TRUST_PROXY/,
    );
  });
});
