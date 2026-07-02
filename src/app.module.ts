import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { ClockModule } from './common/clock/clock.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { MediaModule } from './modules/media/media.module';
import { MembresModule } from './modules/membres/membres.module';
import { ContratsModule } from './modules/contrats/contrats.module';
import { CollecteModule } from './modules/collecte/collecte.module';
import { AvancesModule } from './modules/avances/avances.module';
import { RetraitsModule } from './modules/retraits/retraits.module';
import { SyncModule } from './modules/sync/sync.module';

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
    MediaModule,
    MembresModule,
    ContratsModule,
    CollecteModule,
    AvancesModule,
    RetraitsModule,
    SyncModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
