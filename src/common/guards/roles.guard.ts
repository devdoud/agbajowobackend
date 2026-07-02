import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleAgent } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthAgent } from '@/modules/auth/types';

/**
 * Vérifie le rôle de l'agent authentifié quand une route est annotée @Roles().
 * S'exécute après le JwtAuthGuard (qui pose `request.agent`).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<RoleAgent[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ agent?: AuthAgent }>();
    if (!request.agent || !roles.includes(request.agent.role)) {
      throw new ForbiddenException('Accès refusé');
    }
    return true;
  }
}
