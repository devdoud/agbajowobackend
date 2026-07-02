import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { MembresModule } from '@/modules/membres/membres.module';
import { ContratsModule } from '@/modules/contrats/contrats.module';
import { CollecteModule } from '@/modules/collecte/collecte.module';
import { AvancesModule } from '@/modules/avances/avances.module';
import { RetraitsModule } from '@/modules/retraits/retraits.module';

@Module({
  imports: [
    MembresModule,
    ContratsModule,
    CollecteModule,
    AvancesModule,
    RetraitsModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
