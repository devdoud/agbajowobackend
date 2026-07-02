import { RoleAgent } from '@prisma/client';

/** Agent authentifié attaché à la requête. */
export interface AuthAgent {
  id: string;
  role: RoleAgent;
}

/** Charge utile du jeton d'accès. */
export interface AccessPayload {
  sub: string;
  role: RoleAgent;
  type: 'access';
}

/** Charge utile du jeton de rafraîchissement. */
export interface RefreshPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}
