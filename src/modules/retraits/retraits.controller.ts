import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { RetraitsService } from './retraits.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import {
  effectuerRetraitSchema,
  type EffectuerRetraitDto,
} from './dto/effectuer-retrait.dto';
import type { AuthAgent } from '@/modules/auth/types';

@Controller('retraits')
export class RetraitsController {
  constructor(private readonly retraits: RetraitsService) {}

  @Post()
  @HttpCode(201)
  effectuer(
    @CurrentUser() agent: AuthAgent,
    @Body(new ZodValidationPipe(effectuerRetraitSchema))
    dto: EffectuerRetraitDto,
  ) {
    return this.retraits.effectuer(agent, dto);
  }
}
