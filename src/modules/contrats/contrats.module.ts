import { Module } from '@nestjs/common';
import { ContratsService } from './contrats.service';
import { ContratsController } from './contrats.controller';

@Module({
  controllers: [ContratsController],
  providers: [ContratsService],
  exports: [ContratsService],
})
export class ContratsModule {}
