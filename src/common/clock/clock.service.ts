import { Injectable } from '@nestjs/common';

/**
 * Fournit l'heure courante de façon injectable → les services passent `now()` aux
 * fonctions pures du domaine, ce qui rend le temps testable (pas de `new Date()` épars).
 */
@Injectable()
export class ClockService {
  now(): Date {
    return new Date();
  }
}
