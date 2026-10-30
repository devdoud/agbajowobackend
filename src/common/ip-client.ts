import { isIP } from 'node:net';
import type { ThrottlerGetTrackerFunction } from '@nestjs/throttler';

/**
 * Clé de la limite de débit : l'IP du client.
 *
 * Sur Render, Cloudflare s'ajoute devant le proxy de Render : `req.ip` (même avec
 * `trust proxy`) y est l'IP d'un serveur Cloudflare, qui change d'une requête à l'autre
 * et que partagent des clients différents. Render transmet la vraie IP dans
 * `True-Client-IP` : `CLIENT_IP_HEADER=true-client-ip` la fait lire (spec 0004).
 *
 * Sans en-tête configuré (dev, tests, Caddy), ou si sa valeur n'est pas une IP, on garde
 * `req.ip`. Le contrôle `isIP` borne la clé : une valeur arbitraire ne crée pas de compteur.
 */
export function suivreIpClient(enTete?: string): ThrottlerGetTrackerFunction {
  const nom = enTete?.toLowerCase();
  return (req) => {
    if (nom) {
      const headers = req.headers as Record<string, unknown> | undefined;
      const brute = headers?.[nom];
      const valeur: unknown = Array.isArray(brute) ? brute[0] : brute;
      const ip = typeof valeur === 'string' ? valeur.trim() : '';
      if (isIP(ip) !== 0) return ip;
    }
    return req.ip as string;
  };
}
