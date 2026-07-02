import { Module } from '@nestjs/common';
import { RetraitsService } from './retraits.service';
import { RetraitsController } from './retraits.controller';

@Module({
  controllers: [RetraitsController],
  providers: [RetraitsService],
  exports: [RetraitsService],
})
export class RetraitsModule {}
