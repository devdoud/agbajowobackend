import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCorpsZod, ApiErreurs } from '@/common/swagger/zod-openapi';
import { EXEMPLE_VERSEMENT } from '@/common/swagger/exemples';
import { CollecteService } from './collecte.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { encaisserSchema, type EncaisserDto } from './dto/encaisser.dto';
import type { AuthAgent } from '@/modules/auth/types';

@ApiTags('Versements')
@ApiBearerAuth()
@Controller('versements')
export class CollecteController {
  constructor(private readonly collecte: CollecteService) {}

  @ApiOperation({
    summary: 'Encaisser des mises',
    description:
      'Idempotent par id. Attribue le reçu officiel et la plage de mises ; refuse un dépassement de l’objectif ; passe le contrat en TERMINE à l’objectif. Le contrat est verrouillé pendant l’écriture.',
  })
  @ApiCorpsZod(encaisserSchema)
  @ApiResponse({
    status: 201,
    description: 'Versement enregistré (ou rejoué si l’id existe déjà).',
    schema: { example: EXEMPLE_VERSEMENT },
  })
  @ApiErreurs(400, 401, 404, 422)
  @Post()
  @HttpCode(201)
  encaisser(
    @CurrentUser() agent: AuthAgent,
    @Body(new ZodValidationPipe(encaisserSchema)) dto: EncaisserDto,
  ) {
    return this.collecte.encaisser(agent, dto);
  }
}
