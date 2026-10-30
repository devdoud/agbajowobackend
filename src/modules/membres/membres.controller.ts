import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiCorpsZod,
  ApiErreurs,
  ApiRequeteZod,
} from '@/common/swagger/zod-openapi';
import { MembresService } from './membres.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { creerMembreSchema, type CreerMembreDto } from './dto/creer-membre.dto';
import {
  verifierTelephoneSchema,
  type VerifierTelephoneDto,
} from './dto/verifier-telephone.dto';
import type { AuthAgent } from '@/modules/auth/types';

const LIMIT_DEFAUT = 50;
const LIMIT_MAX = 200;

@ApiTags('Membres')
@ApiBearerAuth()
@Controller('membres')
export class MembresController {
  constructor(private readonly membres: MembresService) {}

  @ApiOperation({
    summary: 'Créer un membre',
    description:
      'Le numéro de membre est attribué par le serveur ; codeMembre peut venir de l’app hors ligne.',
  })
  @ApiCorpsZod(creerMembreSchema)
  @ApiResponse({ status: 201, description: 'Membre créé.' })
  @ApiErreurs(400, 401, 409)
  @Post()
  creer(
    @CurrentUser() agent: AuthAgent,
    @Body(new ZodValidationPipe(creerMembreSchema)) dto: CreerMembreDto,
  ) {
    return this.membres.creer(agent, dto);
  }

  @ApiOperation({
    summary: 'Rechercher des membres',
    description: 'Un AGENT ne voit que ses membres. Paginé par curseur.',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Nom, prénoms ou numéro.',
    schema: { type: 'string' },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string' } })
  @ApiResponse({ status: 200, description: 'Page de membres.' })
  @ApiErreurs(401)
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

  // Avant `:id` : sinon « verifier-telephone » serait lu comme un id.
  @ApiOperation({
    summary: 'Vérifier un numéro sur tous les membres',
    description:
      'Doublons entre agents : cherche le numéro chez tous les membres. Un AGENT ne reçoit la fiche (id, nom, prénoms) que de ses propres membres ; pour les autres, seulement le numéro de membre et l’agent qui le suit.',
  })
  @ApiRequeteZod(verifierTelephoneSchema)
  @ApiResponse({
    status: 200,
    description:
      '{ existe, membres: [{ id, numeroMembre, nom, prenoms, estAMoi, agent: { nom, numeroAgent } }] }.',
  })
  @ApiErreurs(400, 401)
  @Get('verifier-telephone')
  verifierTelephone(
    @CurrentUser() agent: AuthAgent,
    @Query(new ZodValidationPipe(verifierTelephoneSchema))
    query: VerifierTelephoneDto,
  ) {
    return this.membres.verifierTelephone(agent, query.telephone);
  }

  @ApiOperation({ summary: 'Fiche d’un membre' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({ status: 200, description: 'Membre et ses contrats.' })
  @ApiErreurs(401, 404)
  @Get(':id')
  detail(@CurrentUser() agent: AuthAgent, @Param('id') id: string) {
    return this.membres.detail(agent, id);
  }
}
