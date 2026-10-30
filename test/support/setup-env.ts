/**
 * Variables d'environnement des tests d'intégration. `process.env` passe avant le
 * `.env` local que charge ConfigModule : les valeurs de dev ne fuient pas ici.
 * (`DATABASE_URL` est posée par le global setup.)
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'secret-acces-de-test-0123456789';
process.env.JWT_REFRESH_SECRET = 'secret-refresh-de-test-0123456789';
process.env.JWT_ACCESS_TTL = '900';
process.env.JWT_REFRESH_TTL = '2592000';
process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'agbajowo-media-int-'));
// Valeurs neutres : un `.env` de dev réglé pour la prod ne doit pas fuir dans les tests.
process.env.MEDIA_DRIVER = 'disque';
process.env.TRUST_PROXY = '0';
delete process.env.CLIENT_IP_HEADER;
delete process.env.SENTRY_DSN;
if (process.env.DATABASE_URL) process.env.DIRECT_URL = process.env.DATABASE_URL;
