import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MembresService } from './membres.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { creerMembreSchema, type CreerMembreDto } from './dto/creer-membre.dto';
import type { AuthAgent } from '@/modules/auth/types';

const LIMIT_DEFAUT = 50;
const LIMIT_MAX = 200;

@Controller('membres')
export class MembresController {
  constructor(private readonly membres: MembresService) {}

  @Post()
  creer(
    @CurrentUser() agent: AuthAgent,
    @Body(new ZodValidationPipe(creerMembreSchema)) dto: CreerMembreDto,
  ) {
    return this.membres.creer(agent, dto);
  }

  @Get()
  liste(
    @CurrentUser() agent: AuthAgent,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const l = Math.min(Math.max(Number(limit) || LIMIT_DEFAUT, 1), LIMIT_MAX);
    return this.membres.liste(agent, {
      q,
      limit: l,
      cursor: cursor ? BigInt(cursor) : undefined,
    });
  }

  @Get(':id')
  detail(@CurrentUser() agent: AuthAgent, @Param('id') id: string) {
    return this.membres.detail(agent, id);
  }
}
