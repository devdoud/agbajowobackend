import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCorpsZod, ApiErreurs } from '@/common/swagger/zod-openapi';
import { EXEMPLE_RETRAIT } from '@/common/swagger/exemples';
import { RetraitsService } from './retraits.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import {
  effectuerRetraitSchema,
  type EffectuerRetraitDto,
} from './dto/effectuer-retrait.dto';
import type { AuthAgent } from '@/modules/auth/types';

@ApiTags('Retraits')
@ApiBearerAuth()
@Controller('retraits')
export class RetraitsController {
  constructor(private readonly retraits: RetraitsService) {}

  @ApiOperation({
    summary: 'Effectuer un retrait',
    description:
      'Idempotent par id. La commission et l’intérêt restants sont prélevés en priorité, une seule fois ; le net n’est jamais négatif. TOTAL clôt le contrat (CLOTURE_ANTICIPEE). Le contrat est verrouillé pendant l’écriture.',
  })
  @ApiCorpsZod(effectuerRetraitSchema)
  @ApiResponse({
    status: 201,
    description: 'Retrait enregistré (ou rejoué si l’id existe déjà).',
    schema: { example: EXEMPLE_RETRAIT },
  })
  @ApiErreurs(400, 401, 404, 422)
  @Post()
  @HttpCode(201)
  effectuer(
    @CurrentUser() agent: AuthAgent,
    @Body(new ZodValidationPipe(effectuerRetraitSchema))
    dto: EffectuerRetraitDto,
  ) {
    return this.retraits.effectuer(agent, dto);
  }
}
