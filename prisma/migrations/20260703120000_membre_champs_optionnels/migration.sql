-- Rendre facultatifs certains champs du membre (téléphone, date/lieu de naissance,
-- arrondissement, commune, photo).
ALTER TABLE "membres" ALTER COLUMN "telephone" DROP NOT NULL;
ALTER TABLE "membres" ALTER COLUMN "date_naissance" DROP NOT NULL;
ALTER TABLE "membres" ALTER COLUMN "lieu_naissance" DROP NOT NULL;
ALTER TABLE "membres" ALTER COLUMN "arrondissement" DROP NOT NULL;
ALTER TABLE "membres" ALTER COLUMN "commune" DROP NOT NULL;
ALTER TABLE "membres" ALTER COLUMN "photo_id" DROP NOT NULL;
