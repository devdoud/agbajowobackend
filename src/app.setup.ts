import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestId } from './common/middleware/request-id.middleware';
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

  app.use(helmet());
  app.use(requestId);
  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
  });
}
