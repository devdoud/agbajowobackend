import { Module } from '@nestjs/common';
import { CollecteService } from './collecte.service';
import { CollecteController } from './collecte.controller';

@Module({
  controllers: [CollecteController],
  providers: [CollecteService],
  exports: [CollecteService],
})
export class CollecteModule {}
