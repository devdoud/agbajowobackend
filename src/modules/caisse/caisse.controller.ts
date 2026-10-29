import { Controller, Get, Param, Query } from '@nestjs/common';
import { CaisseService } from './caisse.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import {
  agentParamSchema,
  lireRapportSchema,
  type AgentParamDto,
  type LireRapportDto,
} from './dto/lire-rapport.dto';
import type { AuthAgent } from '@/modules/auth/types';

@Controller('caisse')
export class CaisseController {
  constructor(private readonly caisse: CaisseService) {}

  @Get()
  @Roles('SUPERVISEUR', 'ADMIN')
  synthese(
    @Query(new ZodValidationPipe(lireRapportSchema)) query: LireRapportDto,
  ) {
    return this.caisse.synthese(query.date);
  }

  @Get('agents/:agentId')
  rapportAgent(
    @CurrentUser() agent: AuthAgent,
    @Param(new ZodValidationPipe(agentParamSchema)) params: AgentParamDto,
    @Query(new ZodValidationPipe(lireRapportSchema)) query: LireRapportDto,
  ) {
    return this.caisse.rapportAgent(agent, params.agentId, query.date);
  }
}
