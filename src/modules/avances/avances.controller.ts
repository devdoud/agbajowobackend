import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AvancesService } from './avances.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import {
  accorderAvanceSchema,
  type AccorderAvanceDto,
} from './dto/accorder-avance.dto';
import type { AuthAgent } from '@/modules/auth/types';

@Controller('avances')
export class AvancesController {
  constructor(private readonly avances: AvancesService) {}

  @Post()
  @HttpCode(201)
  accorder(
    @CurrentUser() agent: AuthAgent,
    @Body(new ZodValidationPipe(accorderAvanceSchema)) dto: AccorderAvanceDto,
  ) {
    return this.avances.accorder(agent, dto);
  }
}
