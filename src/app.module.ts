import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { suivreIpClient } from './common/ip-client';
import { type Env, validateEnv } from './config/env.validation';
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
import { CaisseModule } from './modules/caisse/caisse.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        getTracker: suivreIpClient(
          config.get('CLIENT_IP_HEADER', { infer: true }),
        ),
      }),
    }),
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
    CaisseModule,
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
