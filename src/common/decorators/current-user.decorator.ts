import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthAgent } from '@/modules/auth/types';

/** Injecte l'agent authentifié (posé par le JwtAuthGuard) dans un handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthAgent => {
    const request = context.switchToHttp().getRequest<{ agent: AuthAgent }>();
    return request.agent;
  },
);
