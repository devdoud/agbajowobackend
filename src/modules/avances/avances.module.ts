import { Module } from '@nestjs/common';
import { AvancesService } from './avances.service';
import { AvancesController } from './avances.controller';

@Module({
  controllers: [AvancesController],
  providers: [AvancesService],
  exports: [AvancesService],
})
export class AvancesModule {}
