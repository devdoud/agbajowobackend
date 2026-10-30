-- Rapport de caisse (spec 0002) : lecture des mouvements par agent et par jour.
CREATE INDEX "versements_agent_id_paid_at_idx" ON "versements"("agent_id", "paid_at");
CREATE INDEX "avances_agent_id_date_avance_idx" ON "avances"("agent_id", "date_avance");
CREATE INDEX "retraits_agent_id_date_retrait_idx" ON "retraits"("agent_id", "date_retrait");
