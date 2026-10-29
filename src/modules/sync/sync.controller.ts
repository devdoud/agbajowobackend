import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCorpsZod, ApiErreurs } from '@/common/swagger/zod-openapi';
import { EXEMPLE_PUSH } from '@/common/swagger/exemples';
import { SyncService } from './sync.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { pushSchema, type PushDto } from './dto/push.dto';
import type { AuthAgent } from '@/modules/auth/types';

const LIMIT_DEFAUT = 200;
const LIMIT_MAX = 1000;

@ApiTags('Synchronisation')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @ApiOperation({
    summary: 'Pousser un lot de changements hors ligne',
    description:
      'Ordre fixe : membres, contrats, versements, avances, retraits. Chaque entité refusée devient un conflit { entity, id, reason } ; les autres sont appliquées. Idempotent : un même lot poussé deux fois ne crée pas de doublon.',
  })
  @ApiCorpsZod(pushSchema)
  @ApiResponse({
    status: 200,
    description: 'Entités appliquées, conflits et curseur courant.',
    schema: { example: EXEMPLE_PUSH },
  })
  @ApiErreurs(400, 401)
  @Post('push')
  @HttpCode(200)
  push(
    @CurrentUser() agent: AuthAgent,
    @Body(new ZodValidationPipe(pushSchema)) dto: PushDto,
  ) {
    return this.sync.push(agent, dto);
  }

  @ApiOperation({
    summary: 'Tirer les changements depuis un curseur',
    description:
      'Renvoie ce qui a changé côté serveur avec server_seq > since, trié, borné par limit, filtré selon le rôle.',
  })
  @ApiQuery({
    name: 'since',
    required: false,
    description: 'Dernier serverSeq reçu (0 au départ).',
    schema: { type: 'string', default: '0' },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 1000, default: 200 },
  })
  @ApiResponse({ status: 200, description: 'Changements et nouveau curseur.' })
  @ApiErreurs(401)
  @Get('pull')
  pull(
    @CurrentUser() agent: AuthAgent,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    const cursor = since ? BigInt(since) : 0n;
    const l = Math.min(Math.max(Number(limit) || LIMIT_DEFAUT, 1), LIMIT_MAX);
    return this.sync.pull(agent, cursor, l);
  }
}
