import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCorpsZod, ApiErreurs } from '@/common/swagger/zod-openapi';
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
@ApiTags('Agents')
@ApiBearerAuth()
@Roles('SUPERVISEUR', 'ADMIN')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @ApiOperation({
    summary: 'Créer un compte',
    description:
      'SUPERVISEUR : comptes AGENT seulement ; ADMIN : tous les rôles. Le mot de passe temporaire est renvoyé une seule fois, le compte devra le changer.',
  })
  @ApiCorpsZod(creerAgentSchema)
  @ApiResponse({
    status: 201,
    description: 'Compte créé : { agent, motDePasseTemporaire }.',
  })
  @ApiErreurs(400, 401, 403, 409)
  @Post()
  creer(
    @CurrentUser() acteur: AuthAgent,
    @Body(new ZodValidationPipe(creerAgentSchema)) dto: CreerAgentDto,
  ) {
    return this.agents.creer(acteur, dto);
  }

  @ApiOperation({
    summary: 'Lister les comptes',
    description: 'Un SUPERVISEUR ne voit que les comptes AGENT.',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des comptes (sans mot de passe).',
  })
  @ApiErreurs(401, 403)
  @Get()
  liste(@CurrentUser() acteur: AuthAgent) {
    return this.agents.liste(acteur);
  }

  @ApiOperation({
    summary: 'Modifier un compte',
    description:
      'Personne ne peut modifier son propre compte ; un SUPERVISEUR ne modifie que des comptes AGENT.',
  })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiCorpsZod(modifierAgentSchema)
  @ApiResponse({ status: 200, description: 'Compte modifié.' })
  @ApiErreurs(400, 401, 403, 404)
  @Patch(':id')
  modifier(
    @CurrentUser() acteur: AuthAgent,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(modifierAgentSchema)) dto: ModifierAgentDto,
  ) {
    return this.agents.modifier(acteur, id, dto);
  }
}
