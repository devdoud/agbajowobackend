import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Attribue un identifiant de corrélation à chaque requête (réutilise `X-Request-Id`
 * s'il est fourni), l'expose en en-tête de réponse et le pose sur `req.requestId`
 * (utilisé par le filtre d'exceptions et les logs).
 */
export function requestId(
  req: Request & { requestId?: string },
  res: Response,
  next: NextFunction,
): void {
  const entete = req.headers['x-request-id'];
  const id =
    typeof entete === 'string' && entete.length > 0 ? entete : randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
