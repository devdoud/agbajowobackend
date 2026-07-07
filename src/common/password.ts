import { randomInt } from 'node:crypto';

// Alphabet sans caractères ambigus (pas de 0/O, 1/I/l) : lisible et transmissible oralement.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Génère un mot de passe temporaire fort et lisible, au format `XXXX-XXXX-XXXX`
 * (12 caractères + tirets). Utilisé à la création/réinitialisation d'un compte agent.
 */
export function genererMotDePasse(): string {
  const groupes: string[] = [];
  for (let g = 0; g < 3; g++) {
    let bloc = '';
    for (let i = 0; i < 4; i++) {
      bloc += ALPHABET[randomInt(ALPHABET.length)];
    }
    groupes.push(bloc);
  }
  return groupes.join('-');
}
