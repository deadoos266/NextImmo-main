-- Extensions Postgres requises par KeyMatch (audit 2026-05-17 Supabase prod).
-- Chargé automatiquement au 1er démarrage du container postgres (via
-- /docker-entrypoint-initdb.d/).
--
-- Extensions Supabase auditées :
-- - pg_stat_statements 1.11 → standard Postgres, OK
-- - pgcrypto 1.3 → standard Postgres, OK
-- - plpgsql 1.0 → inclus dans Postgres
-- - supabase_vault 0.3.1 → SPÉCIFIQUE Supabase (NON migré, à remplacer si utilisé)
-- - uuid-ossp 1.1 → standard Postgres, OK

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Note : supabase_vault est utilisé par Supabase pour stocker secrets chiffrés.
-- Si KeyMatch utilise vault.secrets() quelque part dans son code, il faudra
-- remplacer par une autre solution (env vars ou table chiffrée custom).
-- Audit 2026-05-17 : aucun usage trouvé dans le code KeyMatch.
