/**
 * Fabriques de données pour les tests d'intégration : chaque test crée explicitement
 * ce dont il a besoin, avec des valeurs par défaut valides et surchargeables.
 */
import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import type {
  Agent,
  Avance,
  Contrat,
  Membre,
  Prisma,
  Retrait,
  Versement,
} from '@prisma/client';
import { dateEcheance, parametresGroupe } from '@/domain/parametres-groupe';
import type { PrismaService } from '@/prisma/prisma.service';

export const MOT_DE_PASSE_TEST = 'MotDePasse123!';

let compteurTelephone = 0;

/** Téléphone unique d'au moins 8 chiffres (exigé par loginSchema). */
function telephoneUnique(): string {
  compteurTelephone += 1;
  return `2299${String(compteurTelephone).padStart(6, '0')}`;
}

function aujourdhui(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function creerAgent(
  prisma: PrismaService,
  opts: Partial<Prisma.AgentUncheckedCreateInput> = {},
): Promise<{ agent: Agent; motDePasse: string }> {
  const agent = await prisma.agent.create({
    data: {
      id: randomUUID(),
      nom: 'Agent Test',
      telephone: telephoneUnique(),
      passwordHash: await hash(MOT_DE_PASSE_TEST),
      role: 'AGENT',
      actif: true,
      mustChangePassword: false,
      ...opts,
    },
  });
  return { agent, motDePasse: MOT_DE_PASSE_TEST };
}

export function creerMembre(
  prisma: PrismaService,
  ownerId: string,
  opts: Partial<Prisma.MembreUncheckedCreateInput> = {},
): Promise<Membre> {
  return prisma.membre.create({
    data: {
      id: randomUUID(),
      ownerId,
      nom: 'Houngbédji',
      prenoms: 'Codjo',
      profession: 'Commerçant',
      quartier: 'Zogbo',
      dateSouscription: aujourdhui(),
      ...opts,
    },
  });
}

export function creerContrat(
  prisma: PrismaService,
  membre: Membre,
  opts: Partial<Prisma.ContratUncheckedCreateInput> = {},
): Promise<Contrat> {
  const params = parametresGroupe('GROUPE_1');
  const startDate = aujourdhui();
  return prisma.contrat.create({
    data: {
      id: randomUUID(),
      membreId: membre.id,
      ownerId: membre.ownerId,
      groupe: 'GROUPE_1',
      cadence: params.cadence,
      intervalleJours: params.intervalleJours,
      moisParCycle: params.moisParCycle,
      misesParMois: params.misesParMois,
      targetMises: params.targetMises,
      miseAmount: 500n,
      commissionParMois: params.commissionParMois,
      commissionParCycle: params.commissionParCycle,
      creditAutorise: params.creditAutorise,
      maxAvances: params.maxAvances,
      startDate,
      endDate: dateEcheance(startDate, params),
      statut: 'ACTIF',
      ...opts,
    },
  });
}

/**
 * Versement posé directement en base. La réception serveur (`createdAt`) vaut par
 * défaut la date terrain (synchro immédiate) ; la passer pour simuler une synchro tardive.
 */
export function creerVersement(
  prisma: PrismaService,
  contrat: Contrat,
  agentId: string,
  opts: Partial<Prisma.VersementUncheckedCreateInput> = {},
): Promise<Versement> {
  const id = randomUUID();
  const misesCount = opts.misesCount ?? 1;
  const paidAt = opts.paidAt ?? new Date();
  return prisma.versement.create({
    data: {
      id,
      contratId: contrat.id,
      agentId,
      misesCount,
      amount: BigInt(misesCount) * contrat.miseAmount,
      paidAt,
      createdAt: paidAt,
      idempotencyKey: id,
      ...opts,
    },
  });
}

/** Avance posée directement en base (sans les règles de crédit du service). */
export function creerAvance(
  prisma: PrismaService,
  contrat: Contrat,
  agentId: string,
  opts: Partial<Prisma.AvanceUncheckedCreateInput> = {},
): Promise<Avance> {
  const id = randomUUID();
  const dateAvance = opts.dateAvance ?? new Date();
  return prisma.avance.create({
    data: {
      id,
      contratId: contrat.id,
      agentId,
      rang: 1,
      nbMois: 1,
      montant: 10000n,
      montantAttenduRef: 15500n,
      interet: 250n,
      dateAvance,
      createdAt: dateAvance,
      idempotencyKey: id,
      ...opts,
    },
  });
}

/** Retrait posé directement en base (sans les règles de retrait du service). */
export function creerRetrait(
  prisma: PrismaService,
  contrat: Contrat,
  agentId: string,
  opts: Partial<Prisma.RetraitUncheckedCreateInput> = {},
): Promise<Retrait> {
  const id = randomUUID();
  const dateRetrait = opts.dateRetrait ?? new Date();
  return prisma.retrait.create({
    data: {
      id,
      contratId: contrat.id,
      agentId,
      type: 'PARTIEL',
      montantBrut: 1500n,
      commissionPrelevee: 500n,
      interetDu: 0n,
      montantNet: 1000n,
      dateRetrait,
      createdAt: dateRetrait,
      idempotencyKey: id,
      ...opts,
    },
  });
}
