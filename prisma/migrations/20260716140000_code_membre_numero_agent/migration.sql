-- Numéro court unique par agent (préfixe des codes membres).
CREATE SEQUENCE IF NOT EXISTS agent_seq;
ALTER TABLE "agents" ADD COLUMN "numero_agent" INTEGER;

-- Backfill des agents existants selon l'ordre de création.
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM "agents"
)
UPDATE "agents" a SET "numero_agent" = r.rn FROM ranked r WHERE a.id = r.id;

-- Positionne la séquence après le plus grand numéro attribué.
SELECT setval(
  'agent_seq',
  GREATEST((SELECT COALESCE(MAX("numero_agent"), 0) FROM "agents"), 1),
  (SELECT COUNT(*) > 0 FROM "agents")
);

CREATE UNIQUE INDEX "agents_numero_agent_key" ON "agents"("numero_agent");

-- Code court du membre, généré côté client (offline) : « ⟨numeroAgent⟩-⟨seq⟩ ».
ALTER TABLE "membres" ADD COLUMN "code_membre" TEXT;
CREATE UNIQUE INDEX "membres_code_membre_key" ON "membres"("code_membre");
