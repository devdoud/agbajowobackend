-- CreateEnum
CREATE TYPE "RoleAgent" AS ENUM ('AGENT', 'SUPERVISEUR', 'ADMIN');

-- CreateEnum
CREATE TYPE "Groupe" AS ENUM ('GROUPE_1', 'GROUPE_2');

-- CreateEnum
CREATE TYPE "CadenceCollecte" AS ENUM ('QUOTIDIENNE', 'TOUS_LES_N_JOURS');

-- CreateEnum
CREATE TYPE "StatutContrat" AS ENUM ('ACTIF', 'TERMINE', 'SUSPENDU', 'CLOTURE_ANTICIPEE');

-- CreateEnum
CREATE TYPE "TypeRetrait" AS ENUM ('PARTIEL', 'TOTAL');

-- CreateEnum
CREATE TYPE "TypeMedia" AS ENUM ('PHOTO_IDENTITE');

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "RoleAgent" NOT NULL DEFAULT 'AGENT',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medias" (
    "id" UUID NOT NULL,
    "type" "TypeMedia" NOT NULL DEFAULT 'PHOTO_IDENTITE',
    "mime" TEXT NOT NULL,
    "taille_octets" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "chemin" TEXT NOT NULL,
    "largeur" INTEGER,
    "hauteur" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "server_seq" BIGINT NOT NULL,

    CONSTRAINT "medias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membres" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "numero_membre" TEXT,
    "nom" TEXT NOT NULL,
    "prenoms" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "date_naissance" DATE NOT NULL,
    "lieu_naissance" TEXT NOT NULL,
    "profession" TEXT NOT NULL,
    "quartier" TEXT NOT NULL,
    "arrondissement" TEXT NOT NULL,
    "commune" TEXT NOT NULL,
    "photo_id" UUID NOT NULL,
    "date_souscription" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "server_seq" BIGINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "membres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrats" (
    "id" UUID NOT NULL,
    "membre_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "groupe" "Groupe" NOT NULL,
    "cadence" "CadenceCollecte" NOT NULL,
    "intervalle_jours" INTEGER,
    "mois_par_cycle" INTEGER NOT NULL,
    "mises_par_mois" INTEGER NOT NULL,
    "target_mises" INTEGER NOT NULL,
    "mise_amount" BIGINT NOT NULL,
    "commission_par_mois" INTEGER,
    "commission_par_cycle" INTEGER,
    "credit_autorise" BOOLEAN NOT NULL DEFAULT true,
    "max_avances" INTEGER NOT NULL DEFAULT 2,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "statut" "StatutContrat" NOT NULL DEFAULT 'ACTIF',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "server_seq" BIGINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "contrats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versements" (
    "id" UUID NOT NULL,
    "contrat_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "mises_count" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "numero_mise_debut" INTEGER,
    "numero_mise_fin" INTEGER,
    "receipt_number" TEXT,
    "idempotency_key" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "server_seq" BIGINT NOT NULL,

    CONSTRAINT "versements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avances" (
    "id" UUID NOT NULL,
    "contrat_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "rang" INTEGER NOT NULL,
    "nb_mois" INTEGER NOT NULL,
    "montant" BIGINT NOT NULL,
    "montant_attendu_ref" BIGINT NOT NULL,
    "interet" BIGINT NOT NULL,
    "date_avance" TIMESTAMPTZ(6) NOT NULL,
    "receipt_number" TEXT,
    "idempotency_key" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "server_seq" BIGINT NOT NULL,

    CONSTRAINT "avances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retraits" (
    "id" UUID NOT NULL,
    "contrat_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "type" "TypeRetrait" NOT NULL,
    "montant_brut" BIGINT NOT NULL,
    "commission_prelevee" BIGINT NOT NULL,
    "interet_du" BIGINT NOT NULL DEFAULT 0,
    "montant_net" BIGINT NOT NULL,
    "date_retrait" TIMESTAMPTZ(6) NOT NULL,
    "receipt_number" TEXT,
    "idempotency_key" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "server_seq" BIGINT NOT NULL,

    CONSTRAINT "retraits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_telephone_key" ON "agents"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "medias_checksum_key" ON "medias"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "membres_numero_membre_key" ON "membres"("numero_membre");

-- CreateIndex
CREATE INDEX "membres_owner_id_idx" ON "membres"("owner_id");

-- CreateIndex
CREATE INDEX "membres_owner_id_nom_idx" ON "membres"("owner_id", "nom");

-- CreateIndex
CREATE INDEX "contrats_membre_id_idx" ON "contrats"("membre_id");

-- CreateIndex
CREATE INDEX "contrats_owner_id_statut_idx" ON "contrats"("owner_id", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "versements_receipt_number_key" ON "versements"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "versements_idempotency_key_key" ON "versements"("idempotency_key");

-- CreateIndex
CREATE INDEX "versements_contrat_id_paid_at_idx" ON "versements"("contrat_id", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "avances_receipt_number_key" ON "avances"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "avances_idempotency_key_key" ON "avances"("idempotency_key");

-- CreateIndex
CREATE INDEX "avances_contrat_id_idx" ON "avances"("contrat_id");

-- CreateIndex
CREATE UNIQUE INDEX "retraits_receipt_number_key" ON "retraits"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "retraits_idempotency_key_key" ON "retraits"("idempotency_key");

-- CreateIndex
CREATE INDEX "retraits_contrat_id_idx" ON "retraits"("contrat_id");

-- AddForeignKey
ALTER TABLE "membres" ADD CONSTRAINT "membres_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membres" ADD CONSTRAINT "membres_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "medias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrats" ADD CONSTRAINT "contrats_membre_id_fkey" FOREIGN KEY ("membre_id") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versements" ADD CONSTRAINT "versements_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "contrats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versements" ADD CONSTRAINT "versements_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avances" ADD CONSTRAINT "avances_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "contrats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avances" ADD CONSTRAINT "avances_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retraits" ADD CONSTRAINT "retraits_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "contrats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retraits" ADD CONSTRAINT "retraits_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
