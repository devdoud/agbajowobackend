-- Supabase expose le schéma public par son Data API, avec des droits pour les rôles
-- anon et authenticated : les données des membres et de l'argent seraient lisibles avec
-- la clé publique du projet. Seule l'API doit lire et écrire (spec 0004, mise en ligne
-- AC-5). Sans effet sur une base où ces rôles n'existent pas (dev, tests, VPS).
DO $$
DECLARE
  role_supabase text;
BEGIN
  FOREACH role_supabase IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_supabase) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', role_supabase);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', role_supabase);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', role_supabase);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', role_supabase);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', role_supabase);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', role_supabase);
    END IF;
  END LOOP;
END $$;
