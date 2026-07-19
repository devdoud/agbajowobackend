import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { creerAgentSchema, type CreerAgentDto } from './dto/creer-agent.dto';
import {
  modifierAgentSchema,
  type ModifierAgentDto,
} from './dto/modifier-agent.dto';
import type { AuthAgent } from '@/modules/auth/types';

// Lecture (roster / vue consolidée) : superviseur + admin.
// Gestion des comptes (création, modification) : admin uniquement.
@Roles('SUPERVISEUR', 'ADMIN')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Roles('ADMIN')
  @Post()
  creer(
    @CurrentUser() acteur: AuthAgent,
    @Body(new ZodValidationPipe(creerAgentSchema)) dto: CreerAgentDto,
  ) {
    return this.agents.creer(acteur, dto);
  }

  @Get()
  liste() {
    return this.agents.liste();
  }

  @Roles('ADMIN')
  @Patch(':id')
  modifier(
    @CurrentUser() acteur: AuthAgent,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(modifierAgentSchema)) dto: ModifierAgentDto,
  ) {
    return this.agents.modifier(acteur, id, dto);
  }
}
