import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiErreurs,
  ApiParamsZod,
  ApiRequeteZod,
} from '@/common/swagger/zod-openapi';
import {
  EXEMPLE_RAPPORT_AGENT,
  EXEMPLE_SYNTHESE,
} from '@/common/swagger/exemples';
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

@ApiTags('Rapport de caisse')
@ApiBearerAuth()
@Controller('caisse')
export class CaisseController {
  constructor(private readonly caisse: CaisseService) {}

  @ApiOperation({
    summary: 'Synthèse de la caisse du jour, tous les comptes',
    description:
      'SUPERVISEUR et ADMIN. Une ligne par AGENT actif et par compte ayant eu un mouvement ou une réception tardive ce jour là. Jour du Bénin (UTC+1).',
  })
  @ApiRequeteZod(lireRapportSchema)
  @ApiResponse({
    status: 200,
    description: 'Totaux par compte et de la journée.',
    schema: { example: EXEMPLE_SYNTHESE },
  })
  @ApiErreurs(400, 401, 403)
  @Get()
  @Roles('SUPERVISEUR', 'ADMIN')
  synthese(
    @Query(new ZodValidationPipe(lireRapportSchema)) query: LireRapportDto,
  ) {
    return this.caisse.synthese(query.date);
  }

  @ApiOperation({
    summary: 'Rapport de caisse d’un compte pour un jour',
    description:
      'Encaissé, décaissé (avances + retraits nets), solde attendu (peut être négatif), détail des reçus, arrivées tardives et réceptions tardives. Un AGENT ne lit que le sien (404 sinon).',
  })
  @ApiParamsZod(agentParamSchema)
  @ApiRequeteZod(lireRapportSchema)
  @ApiResponse({
    status: 200,
    description: 'Rapport détaillé.',
    schema: { example: EXEMPLE_RAPPORT_AGENT },
  })
  @ApiErreurs(400, 401, 404)
  @Get('agents/:agentId')
  rapportAgent(
    @CurrentUser() agent: AuthAgent,
    @Param(new ZodValidationPipe(agentParamSchema)) params: AgentParamDto,
    @Query(new ZodValidationPipe(lireRapportSchema)) query: LireRapportDto,
  ) {
    return this.caisse.rapportAgent(agent, params.agentId, query.date);
  }
}
