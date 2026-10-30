-- Pilotage terrain (spec 0005), additif : dernière synchro par agent, et écart
-- d'horloge du téléphone corrigé sur chaque mouvement poussé.
ALTER TABLE "agents" ADD COLUMN "derniere_sync_a" TIMESTAMPTZ(6);
ALTER TABLE "versements" ADD COLUMN "ecart_horloge_s" INTEGER;
ALTER TABLE "avances" ADD COLUMN "ecart_horloge_s" INTEGER;
ALTER TABLE "retraits" ADD COLUMN "ecart_horloge_s" INTEGER;
