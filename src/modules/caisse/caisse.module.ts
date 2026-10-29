import { Module } from '@nestjs/common';
import { CaisseService } from './caisse.service';
import { CaisseController } from './caisse.controller';

@Module({
  controllers: [CaisseController],
  providers: [CaisseService],
})
export class CaisseModule {}
