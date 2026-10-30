import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCorpsZod, ApiErreurs } from '@/common/swagger/zod-openapi';
import { EXEMPLE_LOGIN } from '@/common/swagger/exemples';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { loginSchema, type LoginDto } from './dto/login.dto';
import { refreshSchema, type RefreshDto } from './dto/refresh.dto';
import {
  changePasswordSchema,
  type ChangePasswordDto,
} from './dto/change-password.dto';
import type { AuthAgent } from './types';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiOperation({
    summary: 'Se connecter',
    description:
      'Public. Limité à 10 appels par minute. Si agent.mustChangePassword est vrai, appeler change-password avant le reste.',
  })
  @ApiCorpsZod(loginSchema)
  @ApiResponse({
    status: 200,
    description: 'Jetons et agent connecté.',
    schema: { example: EXEMPLE_LOGIN },
  })
  @ApiErreurs(400, 401, 429)
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.auth.login(dto.telephone, dto.password);
  }

  @ApiOperation({
    summary: 'Renouveler les jetons',
    description:
      'Public. Le jeton de rafraîchissement est consommé (rotation).',
  })
  @ApiCorpsZod(refreshSchema)
  @ApiResponse({
    status: 200,
    description: 'Nouveaux jetons, même forme que le login.',
  })
  @ApiErreurs(400, 401)
  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Se déconnecter',
    description: 'Révoque le jeton de rafraîchissement donné.',
  })
  @ApiCorpsZod(refreshSchema)
  @ApiResponse({ status: 204, description: 'Déconnecté.' })
  @ApiErreurs(400, 401)
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Compte connecté' })
  @ApiResponse({
    status: 200,
    description: 'id, nom, telephone, role, numeroAgent, mustChangePassword.',
  })
  @ApiErreurs(401)
  @Get('me')
  me(@CurrentUser() agent: AuthAgent) {
    return this.auth.me(agent.id);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Changer son mot de passe',
    description:
      'Au moins 8 caractères, une lettre et un chiffre. Obligatoire après création ou réinitialisation du compte.',
  })
  @ApiCorpsZod(changePasswordSchema)
  @ApiResponse({
    status: 200,
    description: 'Mot de passe changé, nouveaux jetons.',
  })
  @ApiErreurs(400, 401)
  @Post('change-password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() agent: AuthAgent,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      agent.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
