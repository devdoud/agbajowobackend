import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCorpsZod, ApiErreurs } from '@/common/swagger/zod-openapi';
import { EXEMPLE_AVANCE } from '@/common/swagger/exemples';
import { AvancesService } from './avances.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import {
  accorderAvanceSchema,
  type AccorderAvanceDto,
} from './dto/accorder-avance.dto';
import type { AuthAgent } from '@/modules/auth/types';

@ApiTags('Avances')
@ApiBearerAuth()
@Controller('avances')
export class AvancesController {
  constructor(private readonly avances: AvancesService) {}

  @ApiOperation({
    summary: 'Accorder une avance',
    description:
      'Idempotent par id. Plafond : 4/5 du montant mensuel attendu par mois avancé ; intérêt : mise / 2 par mois ; au plus maxAvances par contrat. Le contrat est verrouillé pendant l’écriture.',
  })
  @ApiCorpsZod(accorderAvanceSchema)
  @ApiResponse({
    status: 201,
    description: 'Avance enregistrée (ou rejouée si l’id existe déjà).',
    schema: { example: EXEMPLE_AVANCE },
  })
  @ApiErreurs(400, 401, 404, 422)
  @Post()
  @HttpCode(201)
  accorder(
    @CurrentUser() agent: AuthAgent,
    @Body(new ZodValidationPipe(accorderAvanceSchema)) dto: AccorderAvanceDto,
  ) {
    return this.avances.accorder(agent, dto);
  }
}
