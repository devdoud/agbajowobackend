import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CollecteService } from './collecte.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { encaisserSchema, type EncaisserDto } from './dto/encaisser.dto';
import type { AuthAgent } from '@/modules/auth/types';

@Controller('versements')
export class CollecteController {
  constructor(private readonly collecte: CollecteService) {}

  @Post()
  @HttpCode(201)
  encaisser(
    @CurrentUser() agent: AuthAgent,
    @Body(new ZodValidationPipe(encaisserSchema)) dto: EncaisserDto,
  ) {
    return this.collecte.encaisser(agent, dto);
  }
}
