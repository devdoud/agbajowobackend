-- Réceptions tardives du rapport de caisse (spec 0002, AC-13 à AC-18) : lecture par date de réception.
CREATE INDEX "versements_created_at_idx" ON "versements"("created_at");
CREATE INDEX "avances_created_at_idx" ON "avances"("created_at");
CREATE INDEX "retraits_created_at_idx" ON "retraits"("created_at");
