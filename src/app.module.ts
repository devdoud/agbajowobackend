import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { ClockModule } from './common/clock/clock.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { MediaModule } from './modules/media/media.module';
import { MembresModule } from './modules/membres/membres.module';
import { ContratsModule } from './modules/contrats/contrats.module';
import { CollecteModule } from './modules/collecte/collecte.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    ClockModule,
    AuthModule,
    MediaModule,
    MembresModule,
    ContratsModule,
    CollecteModule,
    HealthModule,
  ],
})
export class AppModule {}
