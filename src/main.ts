import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestId } from './common/middleware/request-id.middleware';
import type { Env } from './config/env.validation';

// Les BigInt (montants FCFA, server_seq) sont sérialisés en chaînes dans les réponses JSON.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
): string {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.use(helmet());
  app.use(requestId);
  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  Logger.log(`API démarrée sur http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
