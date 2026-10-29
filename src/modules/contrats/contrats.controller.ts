import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCorpsZod, ApiErreurs } from '@/common/swagger/zod-openapi';
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

@ApiTags('Contrats')
@ApiBearerAuth()
@Controller('contrats')
export class ContratsController {
  constructor(private readonly contrats: ContratsService) {}

  @ApiOperation({
    summary: 'Souscrire un contrat',
    description:
      'Les paramètres du groupe (mises par mois, objectif, commission) sont copiés sur le contrat.',
  })
  @ApiCorpsZod(souscrireContratSchema)
  @ApiResponse({ status: 201, description: 'Contrat créé.' })
  @ApiErreurs(400, 401, 404)
  @Post()
  souscrire(
    @CurrentUser() agent: AuthAgent,
    @Body(new ZodValidationPipe(souscrireContratSchema))
    dto: SouscrireContratDto,
  ) {
    return this.contrats.souscrire(agent, dto);
  }

  @ApiOperation({
    summary: 'Détail d’un contrat',
    description:
      'Avec les valeurs dérivées (mises versées, statut de collecte).',
  })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({ status: 200, description: 'Contrat et dérivées.' })
  @ApiErreurs(401, 404)
  @Get(':id')
  detail(@CurrentUser() agent: AuthAgent, @Param('id') id: string) {
    return this.contrats.detail(agent, id);
  }

  @ApiOperation({
    summary: 'Historique des versements d’un contrat',
    description: 'Paginé par curseur server_seq.',
  })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'server_seq du dernier élément reçu.',
    schema: { type: 'string' },
  })
  @ApiResponse({ status: 200, description: 'Page de versements.' })
  @ApiErreurs(401, 404)
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

  @ApiOperation({ summary: 'Avances d’un contrat' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({ status: 200, description: 'Avances du contrat.' })
  @ApiErreurs(401, 404)
  @Get(':id/avances')
  avances(@CurrentUser() agent: AuthAgent, @Param('id') id: string) {
    return this.contrats.historiqueAvances(agent, id);
  }

  @ApiOperation({ summary: 'Retraits d’un contrat' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({ status: 200, description: 'Retraits du contrat.' })
  @ApiErreurs(401, 404)
  @Get(':id/retraits')
  retraits(@CurrentUser() agent: AuthAgent, @Param('id') id: string) {
    return this.contrats.historiqueRetraits(agent, id);
  }

  @ApiOperation({
    summary: 'Relevé d’un contrat',
    description: 'Solde, commission, avances et net à virer.',
  })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'mois',
    required: false,
    description: 'Numéro du mois du cycle.',
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiResponse({ status: 200, description: 'Relevé.' })
  @ApiErreurs(400, 401, 404)
  @Get(':id/releve')
  releve(
    @CurrentUser() agent: AuthAgent,
    @Param('id') id: string,
    @Query('mois') mois?: string,
  ) {
    return this.contrats.releve(agent, id, mois ? Number(mois) : undefined);
  }
}
