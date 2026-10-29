import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ClockModule } from './common/clock/clock.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AgentsModule } from './modules/agents/agents.module';
import { MediaModule } from './modules/media/media.module';
import { MembresModule } from './modules/membres/membres.module';
import { ContratsModule } from './modules/contrats/contrats.module';
import { CollecteModule } from './modules/collecte/collecte.module';
import { AvancesModule } from './modules/avances/avances.module';
import { RetraitsModule } from './modules/retraits/retraits.module';
import { SyncModule } from './modules/sync/sync.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    ClockModule,
    AuthModule,
    AgentsModule,
    MediaModule,
    MembresModule,
    ContratsModule,
    CollecteModule,
    AvancesModule,
    RetraitsModule,
    SyncModule,
    DashboardModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    // `useExisting` : le guard reste remplaçable dans les tests d'intégration
    // (overrideProvider(ThrottlerGuard)).
    ThrottlerGuard,
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
  ],
})
export class AppModule {}
