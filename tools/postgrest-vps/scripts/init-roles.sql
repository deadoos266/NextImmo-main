-- PostgREST roles setup — V97.39.33 Phase 7 KeyMatch
--
-- Crée les rôles attendus par PostgREST en mode "Supabase-compatible" :
--   - authenticator : rôle de connexion utilisé par PostgREST (NOLOGIN
--     interdits, doit pouvoir SET ROLE vers les 3 autres)
--   - anon : rôle pour requêtes sans JWT (lecture seule des tables publiques)
--   - authenticated : rôle pour requêtes avec JWT user (NextAuth signe avec
--     role=authenticated)
--   - service_role : bypass RLS, utilisé par les routes API server-only
--
-- Idempotent : safe à relancer.

-- 1) Rôles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- BYPASSRLS : équivaut au comportement supabase service_role
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    -- LOGIN : PostgREST utilise ce rôle pour ouvrir la connexion Postgres.
    -- Le password sera défini par scripts/set-authenticator-password.sh
    -- en lecture depuis .env (POSTGREST_DB_PASSWORD).
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'set_by_script';
  END IF;
END $$;

-- 2) Grant SET ROLE pour PostgREST
GRANT anon, authenticated, service_role TO authenticator;

-- 3) Permissions schéma public (sinon les rôles ne voient rien)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Tables existantes
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

-- Séquences (pour les INSERT avec colonne serial / bigserial)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Fonctions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 4) Default privileges : applique aux tables/séquences créées plus tard
--    par les migrations (083_*.sql, etc.).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- 5) BYPASSRLS pour service_role (rappel, au cas où la création initiale
--    aurait été faite sans cet attribut)
ALTER ROLE service_role BYPASSRLS;

-- Affichage final pour vérification
SELECT rolname, rolcanlogin, rolbypassrls, rolinherit
FROM pg_roles
WHERE rolname IN ('anon', 'authenticated', 'service_role', 'authenticator', 'keymatch')
ORDER BY rolname;
