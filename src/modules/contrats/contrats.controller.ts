import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ContratsService } from './contrats.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import {
  souscrireContratSchema,
  type SouscrireContratDto,
} from './dto/souscrire-contrat.dto';
import type { AuthAgent } from '@/modules/auth/types';

const LIMIT_DEFAUT = 50;
const LIMIT_MAX = 200;

@Controller('contrats')
export class ContratsController {
  constructor(private readonly contrats: ContratsService) {}

  @Post()
  souscrire(
    @CurrentUser() agent: AuthAgent,
    @Body(new ZodValidationPipe(souscrireContratSchema))
    dto: SouscrireContratDto,
  ) {
    return this.contrats.souscrire(agent, dto);
  }

  @Get(':id')
  detail(@CurrentUser() agent: AuthAgent, @Param('id') id: string) {
    return this.contrats.detail(agent, id);
  }

  @Get(':id/versements')
  versements(
    @CurrentUser() agent: AuthAgent,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const l = Math.min(Math.max(Number(limit) || LIMIT_DEFAUT, 1), LIMIT_MAX);
    return this.contrats.historiqueVersements(
      agent,
      id,
      l,
      cursor ? BigInt(cursor) : undefined,
    );
  }

  @Get(':id/avances')
  avances(@CurrentUser() agent: AuthAgent, @Param('id') id: string) {
    return this.contrats.historiqueAvances(agent, id);
  }

  @Get(':id/retraits')
  retraits(@CurrentUser() agent: AuthAgent, @Param('id') id: string) {
    return this.contrats.historiqueRetraits(agent, id);
  }

  @Get(':id/releve')
  releve(
    @CurrentUser() agent: AuthAgent,
    @Param('id') id: string,
    @Query('mois') mois?: string,
  ) {
    return this.contrats.releve(agent, id, mois ? Number(mois) : undefined);
  }
}
