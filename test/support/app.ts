import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { configurerApp } from '@/app.setup';
import { PrismaService } from '@/prisma/prisma.service';

export interface AppDeTest {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Monte la vraie application (même configuration que la prod via `configurerApp`).
 * La limite de débit est neutralisée par défaut pour que la suite ne tombe pas en 429 ;
 * `limiteDeDebit: true` la garde active (test dédié).
 */
export async function creerAppDeTest(
  opts: { limiteDeDebit?: boolean } = {},
): Promise<AppDeTest> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (!opts.limiteDeDebit) {
    builder = builder
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true });
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configurerApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

/** Corps d'erreur normalisé par AllExceptionsFilter. */
export interface CorpsErreur {
  code: string;
  message: string;
  requestId: string;
}

/** Type le corps JSON d'une réponse supertest (typé `any` par la librairie). */
export function corps<T>(res: request.Response): T {
  return res.body as T;
}

/** Se connecte par le vrai login et renvoie le jeton d'accès. */
export async function seConnecter(
  app: INestApplication,
  telephone: string,
  motDePasse: string,
): Promise<string> {
  const res = await request(app.getHttpServer() as App)
    .post('/api/v1/auth/login')
    .send({ telephone, password: motDePasse });
  if (res.status !== 200) {
    throw new Error(
      `Login de test refusé (${res.status}) : ${JSON.stringify(res.body)}`,
    );
  }
  return corps<{ accessToken: string }>(res).accessToken;
}
