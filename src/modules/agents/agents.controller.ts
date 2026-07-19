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

// Superviseur + admin. Le superviseur ne voit et ne gère QUE des comptes AGENT
// (filtrage et contrôles appliqués dans le service) ; l'admin gère tout le monde.
@Roles('SUPERVISEUR', 'ADMIN')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post()
  creer(
    @CurrentUser() acteur: AuthAgent,
    @Body(new ZodValidationPipe(creerAgentSchema)) dto: CreerAgentDto,
  ) {
    return this.agents.creer(acteur, dto);
  }

  @Get()
  liste(@CurrentUser() acteur: AuthAgent) {
    return this.agents.liste(acteur);
  }

  @Patch(':id')
  modifier(
    @CurrentUser() acteur: AuthAgent,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(modifierAgentSchema)) dto: ModifierAgentDto,
  ) {
    return this.agents.modifier(acteur, id, dto);
  }
}
