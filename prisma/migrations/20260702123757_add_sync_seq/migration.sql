-- Séquence partagée : curseur de synchronisation global (docs/05-sync.md).
-- Attribue automatiquement server_seq à toutes les tables synchronisées.
CREATE SEQUENCE IF NOT EXISTS sync_seq;

-- AlterTable
ALTER TABLE "avances" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "contrats" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "medias" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "membres" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "retraits" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "versements" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq'::regclass);
