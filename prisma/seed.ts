/**
 * Seed de démonstration — lot L1.
 * Crée un agent, deux membres (Groupe 1 et Groupe 2) avec photo factice,
 * leurs contrats et quelques versements.
 *
 * NB : le `passwordHash` est un placeholder de développement ; le hachage réel
 * (Argon2) arrive au lot L2. Les `id` sont des UUID (v4 ici, suffisant pour le seed)
 * et les `serverSeq`/`numeroMembre` sont attribués manuellement (rôle du serveur).
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let seq = 0n;
const nextSeq = () => (seq += 1n);

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  // Nettoyage (ordre dépendances : enfants d'abord) pour un seed ré-exécutable.
  await prisma.retrait.deleteMany();
  await prisma.avance.deleteMany();
  await prisma.versement.deleteMany();
  await prisma.contrat.deleteMany();
  await prisma.membre.deleteMany();
  await prisma.media.deleteMany();
  await prisma.agent.deleteMany();

  // ── Agent ────────────────────────────────────────────────
  const agentId = randomUUID();
  await prisma.agent.create({
    data: {
      id: agentId,
      nom: 'Agent Terrain',
      telephone: '22990000000',
      passwordHash: 'dev-placeholder-non-hache', // remplacé par Argon2 au lot L2
      role: 'ADMIN',
    },
  });

  // ── Médias (photos factices) ─────────────────────────────
  const photo1Id = randomUUID();
  const photo2Id = randomUUID();
  await prisma.media.createMany({
    data: [
      {
        id: photo1Id,
        mime: 'image/jpeg',
        tailleOctets: 102400,
        checksum: `sha256:demo-${photo1Id}`,
        chemin: `/media/${photo1Id}.jpg`,
        serverSeq: nextSeq(),
      },
      {
        id: photo2Id,
        mime: 'image/jpeg',
        tailleOctets: 98304,
        checksum: `sha256:demo-${photo2Id}`,
        chemin: `/media/${photo2Id}.jpg`,
        serverSeq: nextSeq(),
      },
    ],
  });

  // ── Membre + contrat Groupe 1 (journalier) ───────────────
  const membre1Id = randomUUID();
  await prisma.membre.create({
    data: {
      id: membre1Id,
      ownerId: agentId,
      numeroMembre: 'MBR-00001',
      nom: 'Traoré',
      prenoms: 'Moussa',
      telephone: '22970000001',
      dateNaissance: new Date('1988-03-12'),
      lieuNaissance: 'Cotonou',
      profession: 'Commerçant',
      quartier: 'Marché central',
      arrondissement: '1er',
      commune: 'Cotonou',
      photoId: photo1Id,
      dateSouscription: new Date('2026-01-01'),
      serverSeq: nextSeq(),
    },
  });

  const startG1 = new Date('2026-01-01');
  const contrat1Id = randomUUID();
  await prisma.contrat.create({
    data: {
      id: contrat1Id,
      membreId: membre1Id,
      ownerId: agentId,
      groupe: 'GROUPE_1',
      cadence: 'QUOTIDIENNE',
      intervalleJours: null,
      moisParCycle: 12,
      misesParMois: 31,
      targetMises: 372,
      miseAmount: 1000n,
      commissionParMois: 1,
      commissionParCycle: null,
      startDate: startG1,
      endDate: addDays(startG1, 372),
      serverSeq: nextSeq(),
    },
  });

  // Quelques versements pour le membre 1
  await prisma.versement.createMany({
    data: [
      {
        id: randomUUID(),
        contratId: contrat1Id,
        agentId,
        misesCount: 1,
        amount: 1000n,
        paidAt: new Date('2026-01-02T08:10:00Z'),
        numeroMiseDebut: 1,
        numeroMiseFin: 1,
        receiptNumber: 'REC-20260102-00001',
        idempotencyKey: randomUUID(),
        serverSeq: nextSeq(),
      },
      {
        id: randomUUID(),
        contratId: contrat1Id,
        agentId,
        misesCount: 3,
        amount: 3000n,
        paidAt: new Date('2026-01-03T08:20:00Z'),
        numeroMiseDebut: 2,
        numeroMiseFin: 4,
        receiptNumber: 'REC-20260103-00002',
        idempotencyKey: randomUUID(),
        serverSeq: nextSeq(),
      },
    ],
  });

  // ── Membre + contrat Groupe 2 (tous les 5 jours) ─────────
  const membre2Id = randomUUID();
  await prisma.membre.create({
    data: {
      id: membre2Id,
      ownerId: agentId,
      numeroMembre: 'MBR-00002',
      nom: 'Koné',
      prenoms: 'Aminata',
      telephone: '22970000002',
      dateNaissance: new Date('1992-07-25'),
      lieuNaissance: 'Porto-Novo',
      profession: 'Couturière',
      quartier: 'Gbégamey',
      arrondissement: '5e',
      commune: 'Cotonou',
      photoId: photo2Id,
      dateSouscription: new Date('2026-01-05'),
      serverSeq: nextSeq(),
    },
  });

  const startG2 = new Date('2026-01-05');
  const contrat2Id = randomUUID();
  await prisma.contrat.create({
    data: {
      id: contrat2Id,
      membreId: membre2Id,
      ownerId: agentId,
      groupe: 'GROUPE_2',
      cadence: 'TOUS_LES_N_JOURS',
      intervalleJours: 5,
      moisParCycle: 12,
      misesParMois: 8,
      targetMises: 96,
      miseAmount: 500n,
      commissionParMois: null,
      commissionParCycle: 3,
      startDate: startG2,
      endDate: addDays(startG2, 96 * 5),
      serverSeq: nextSeq(),
    },
  });

  await prisma.versement.create({
    data: {
      id: randomUUID(),
      contratId: contrat2Id,
      agentId,
      misesCount: 1,
      amount: 500n,
      paidAt: new Date('2026-01-05T09:30:00Z'),
      numeroMiseDebut: 1,
      numeroMiseFin: 1,
      receiptNumber: 'REC-20260105-00003',
      idempotencyKey: randomUUID(),
      serverSeq: nextSeq(),
    },
  });

  console.log('✅ Seed terminé : 1 agent, 2 membres (G1 + G2), 2 contrats, 3 versements.');
}

main()
  .catch((error) => {
    console.error('❌ Échec du seed :', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
