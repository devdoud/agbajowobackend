/**
 * Exemples de réponses pour la doc Swagger des routes d'argent et de caisse.
 * Montants en chaînes (BigInt sérialisés), instants ISO 8601 en UTC.
 */

const MEMBRE = {
  id: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
  nom: 'Houngbédji',
  prenoms: 'Codjo',
  numeroMembre: 'MBR-00012',
  codeMembre: '3-014',
};

export const EXEMPLE_LOGIN = {
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  accessExpiresIn: 900,
  refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  refreshExpiresIn: 2592000,
  agent: {
    id: '9d507c51-861f-48d7-bed8-d83d1cefd04e',
    nom: 'Agent Terrain',
    telephone: '22997000001',
    role: 'AGENT',
    numeroAgent: 3,
    mustChangePassword: false,
  },
};

export const EXEMPLE_VERSEMENT = {
  id: '466fa55f-6168-4e71-a0fd-aa40edef265d',
  contratId: '8cf8b257-13a3-4537-ad34-dac425ad7a8b',
  agentId: '9d507c51-861f-48d7-bed8-d83d1cefd04e',
  misesCount: 3,
  amount: '1500',
  paidAt: '2026-10-29T10:00:00.000Z',
  numeroMiseDebut: 1,
  numeroMiseFin: 3,
  receiptNumber: 'REC-20261029-00003',
  idempotencyKey: '466fa55f-6168-4e71-a0fd-aa40edef265d',
  createdAt: '2026-10-29T10:00:01.327Z',
  serverSeq: '1042',
};

export const EXEMPLE_AVANCE = {
  id: 'b1d2c3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
  contratId: '8cf8b257-13a3-4537-ad34-dac425ad7a8b',
  agentId: '9d507c51-861f-48d7-bed8-d83d1cefd04e',
  rang: 1,
  nbMois: 1,
  montant: '10000',
  montantAttenduRef: '15500',
  interet: '250',
  dateAvance: '2026-10-29T11:00:00.000Z',
  receiptNumber: 'REC-20261029-00004',
  idempotencyKey: 'b1d2c3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
  createdAt: '2026-10-29T11:00:00.812Z',
  serverSeq: '1043',
};

export const EXEMPLE_RETRAIT = {
  id: 'a1cb7e90-f17e-4757-b2f7-ea9601b0dd1b',
  contratId: '8cf8b257-13a3-4537-ad34-dac425ad7a8b',
  agentId: '9d507c51-861f-48d7-bed8-d83d1cefd04e',
  type: 'PARTIEL',
  montantBrut: '1500',
  commissionPrelevee: '500',
  interetDu: '0',
  montantNet: '1000',
  dateRetrait: '2026-10-29T15:00:00.000Z',
  receiptNumber: 'REC-20261029-00007',
  idempotencyKey: 'a1cb7e90-f17e-4757-b2f7-ea9601b0dd1b',
  createdAt: '2026-10-29T15:00:00.463Z',
  serverSeq: '1044',
};

const TOTAUX = {
  encaisse: '6000',
  avances: '1000',
  retraitsNets: '1000',
  decaisse: '2000',
  soldeAttendu: '4000',
  nbMouvements: 4,
};

const RECEPTIONS_SYNTHESE = { nbMouvements: 1, effetSolde: '1000' };

export const EXEMPLE_RAPPORT_AGENT = {
  agent: {
    id: '9d507c51-861f-48d7-bed8-d83d1cefd04e',
    nom: 'Agent Terrain',
    role: 'AGENT',
    actif: true,
    supprime: false,
  },
  date: '2026-10-29',
  fuseau: 'Africa/Porto-Novo',
  genereA: '2026-10-29T19:30:00.000Z',
  totaux: TOTAUX,
  soldeNegatif: false,
  arriveesTardives: 0,
  lignes: [
    {
      type: 'VERSEMENT',
      id: '466fa55f-6168-4e71-a0fd-aa40edef265d',
      dateTerrain: '2026-10-29T10:00:00.000Z',
      recuServeurA: '2026-10-29T10:00:01.327Z',
      arriveeTardive: false,
      receiptNumber: 'REC-20261029-00003',
      montant: '5000',
      contratId: '8cf8b257-13a3-4537-ad34-dac425ad7a8b',
      misesCount: 10,
      membre: MEMBRE,
    },
    {
      type: 'RETRAIT',
      id: 'a1cb7e90-f17e-4757-b2f7-ea9601b0dd1b',
      dateTerrain: '2026-10-29T15:00:00.000Z',
      recuServeurA: '2026-10-29T15:00:00.463Z',
      arriveeTardive: false,
      receiptNumber: 'REC-20261029-00007',
      montant: '1000',
      contratId: '8cf8b257-13a3-4537-ad34-dac425ad7a8b',
      typeRetrait: 'PARTIEL',
      montantBrut: '1500',
      commissionPrelevee: '500',
      interetDu: '0',
      membre: MEMBRE,
    },
  ],
  receptionsTardives: {
    nbMouvements: 1,
    effetSolde: '1000',
    parJour: [
      {
        date: '2026-10-28',
        nbMouvements: 1,
        encaisse: '1000',
        avances: '0',
        retraitsNets: '0',
        decaisse: '0',
        effetSolde: '1000',
      },
    ],
    lignes: [
      {
        type: 'VERSEMENT',
        id: '612ff7ca-b6c2-49e9-9401-778bab18d04b',
        dateTerrain: '2026-10-28T11:00:00.000Z',
        recuServeurA: '2026-10-29T08:12:44.020Z',
        arriveeTardive: true,
        receiptNumber: 'REC-20261029-00001',
        montant: '1000',
        contratId: '8cf8b257-13a3-4537-ad34-dac425ad7a8b',
        misesCount: 2,
        membre: MEMBRE,
        jourTerrain: '2026-10-28',
      },
    ],
  },
};

export const EXEMPLE_SYNTHESE = {
  date: '2026-10-29',
  fuseau: 'Africa/Porto-Novo',
  genereA: '2026-10-29T19:30:00.000Z',
  totaux: TOTAUX,
  soldeNegatif: false,
  arriveesTardives: 0,
  receptionsTardives: RECEPTIONS_SYNTHESE,
  agents: [
    {
      agent: EXEMPLE_RAPPORT_AGENT.agent,
      totaux: TOTAUX,
      soldeNegatif: false,
      arriveesTardives: 0,
      receptionsTardives: RECEPTIONS_SYNTHESE,
    },
  ],
};

export const EXEMPLE_PUSH = {
  applied: {
    membres: [],
    contrats: [],
    versements: [
      {
        id: '466fa55f-6168-4e71-a0fd-aa40edef265d',
        receiptNumber: 'REC-20261029-00003',
        numeroMiseDebut: 1,
        numeroMiseFin: 3,
        serverSeq: '1042',
      },
    ],
    avances: [],
    retraits: [],
  },
  conflicts: [
    {
      entity: 'retrait',
      id: 'a418530a-5d44-4224-8fde-c7b2bcd295e3',
      reason: 'Date terrain manquante.',
    },
  ],
  serverSeq: '1042',
};
