/**
 * Types du domaine — indépendants du framework et de Prisma.
 * Les montants sont des entiers FCFA (number : les montants restent bien en deçà
 * de Number.MAX_SAFE_INTEGER ; la conversion depuis les BigInt Prisma se fait dans
 * la couche service).
 */

export type Groupe = 'GROUPE_1' | 'GROUPE_2';

export type Cadence = 'QUOTIDIENNE' | 'TOUS_LES_N_JOURS';

export type StatutCollecte = 'paye' | 'a_collecter' | 'en_retard' | 'termine';
