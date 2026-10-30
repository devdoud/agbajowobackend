import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErreurs, ApiRequeteZod } from '@/common/swagger/zod-openapi';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { lireSerieSchema, type LireSerieDto } from './dto/lire-serie.dto';
import { DashboardService, type Periode } from './dashboard.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { StatutCollecte } from '@/domain/types';
import type { AuthAgent } from '@/modules/auth/types';

const PERIODES: Periode[] = ['today', 'yesterday', 'week', 'month', 'custom'];

function parsePeriode(value?: string): Periode {
  return PERIODES.includes(value as Periode) ? (value as Periode) : 'today';
}

@ApiTags('Tableau de bord')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @ApiOperation({
    summary: 'Statistiques',
    description: 'Filtrées par rôle : un AGENT ne voit que ses contrats.',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    schema: {
      type: 'string',
      enum: ['today', 'yesterday', 'week', 'month', 'custom'],
      default: 'today',
    },
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date de référence (période custom).',
    schema: { type: 'string', format: 'date' },
  })
  @ApiResponse({ status: 200, description: 'Statistiques de la période.' })
  @ApiErreurs(401)
  @Get('stats')
  stats(
    @CurrentUser() agent: AuthAgent,
    @Query('period') period?: string,
    @Query('date') date?: string,
  ) {
    return this.dashboard.stats(agent, parsePeriode(period), date);
  }

  @ApiOperation({
    summary: 'Courbe par jour',
    description:
      'Un point par jour du Bénin (UTC+1), aujourd’hui compris : encaissé, nombre de versements, avances et retraits nets, rangés par date terrain comme le rapport de caisse. Un AGENT ne lit que la sienne.',
  })
  @ApiRequeteZod(lireSerieSchema)
  @ApiResponse({
    status: 200,
    description:
      '{ du, au, fuseau, agentId, points: [{ date, encaisse, nbVersements, avances, retraitsNets }] } (montants en nombres).',
  })
  @ApiErreurs(400, 401, 404)
  @Get('serie')
  serie(
    @CurrentUser() agent: AuthAgent,
    @Query(new ZodValidationPipe(lireSerieSchema)) query: LireSerieDto,
  ) {
    return this.dashboard.serie(agent, query.jours, query.agentId);
  }

  @ApiOperation({
    summary: 'File de collecte',
    description: 'Contrats à collecter, triés par priorité.',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    schema: {
      type: 'string',
      enum: ['today', 'yesterday', 'week', 'month', 'custom'],
      default: 'today',
    },
  })
  @ApiQuery({
    name: 'statut',
    required: false,
    schema: {
      type: 'string',
      enum: ['paye', 'a_collecter', 'en_retard', 'termine'],
    },
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Recherche par nom de membre.',
    schema: { type: 'string' },
  })
  @ApiQuery({
    name: 'date',
    required: false,
    schema: { type: 'string', format: 'date' },
  })
  @ApiResponse({ status: 200, description: 'File de collecte.' })
  @ApiErreurs(401)
  @Get('file')
  file(
    @CurrentUser() agent: AuthAgent,
    @Query('period') period?: string,
    @Query('statut') statut?: StatutCollecte,
    @Query('q') q?: string,
    @Query('date') date?: string,
  ) {
    return this.dashboard.file(agent, parsePeriode(period), statut, q, date);
  }
}
