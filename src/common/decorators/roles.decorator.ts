import { SetMetadata } from '@nestjs/common';
import { RoleAgent } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restreint une route à un ou plusieurs rôles. */
export const Roles = (...roles: RoleAgent[]) => SetMetadata(ROLES_KEY, roles);
