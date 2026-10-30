import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestId } from './common/middleware/request-id.middleware';
import { configurerSwagger } from './common/swagger/swagger';
import type { Env } from './config/env.validation';

/**
 * Configuration HTTP commune à la prod (`main.ts`) et aux tests d'intégration :
 * ainsi l'app testée se comporte exactement comme l'app déployée.
 */
export function configurerApp(app: INestApplication): void {
  // Les BigInt (montants FCFA, server_seq) sont sérialisés en chaînes dans les réponses JSON.
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
    this: bigint,
  ): string {
    return this.toString();
  };

  const config = app.get(ConfigService<Env, true>);

  // Derrière Render ou Caddy, `req.ip` doit être l'IP du client (la limite de débit en
  // dépend). Un nombre de sauts, jamais `true` : le proxy ajoute à X-Forwarded-For sans
  // filtrer ce que le client a envoyé (spec 0004).
  const express = app.getHttpAdapter().getInstance() as {
    set(cle: string, valeur: unknown): void;
  };
  express.set('trust proxy', config.get('TRUST_PROXY', { infer: true }) ?? 0);

  app.use(helmet());
  app.use(requestId);
  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
  });

  // Après le préfixe : le document décrit les routes telles qu'elles sont servies.
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    configurerSwagger(app);
  }
}
