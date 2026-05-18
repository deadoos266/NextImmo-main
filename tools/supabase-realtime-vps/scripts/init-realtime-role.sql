-- Supabase Realtime self-host setup — V97.39.33 Phase 7b KeyMatch
--
-- Crée le rôle requis par l'image supabase/realtime + la publication SQL
-- qui broadcaste les changements des tables avec triggers realtime.
--
-- Idempotent : safe à relancer.

-- 1) Rôle supabase_realtime_admin
--    Requirements : LOGIN + REPLICATION (pour logical decoding)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_realtime_admin') THEN
    CREATE ROLE supabase_realtime_admin
      LOGIN
      REPLICATION
      PASSWORD 'set_by_script';
  END IF;
END $$;

-- Permissions sur les tables Realtime (publication)
GRANT USAGE ON SCHEMA public TO supabase_realtime_admin;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO supabase_realtime_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO supabase_realtime_admin;

-- 2) Schéma _realtime (utilisé par l'image pour stocker tenants config)
CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_realtime_admin;
GRANT ALL ON SCHEMA _realtime TO supabase_realtime_admin;

-- 3) Publication SQL (capture INSERT/UPDATE/DELETE sur les tables ciblées)
--    Tables KeyMatch avec realtime (cf audit V97.39.20) :
--    - messages, notifications, visites, annonces
--    - bail_signatures, edl_signatures, contacts, signalements
--    - etats_des_lieux, loyers
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    DROP PUBLICATION supabase_realtime;
  END IF;
  CREATE PUBLICATION supabase_realtime FOR TABLE
    messages,
    notifications,
    visites,
    annonces,
    bail_signatures,
    edl_signatures,
    contacts,
    signalements,
    etats_des_lieux,
    loyers
  WITH (publish = 'insert, update, delete');
END $$;

-- 4) Replica identity FULL pour que UPDATE/DELETE broadcastent les anciennes valeurs
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER TABLE visites REPLICA IDENTITY FULL;
ALTER TABLE annonces REPLICA IDENTITY FULL;
ALTER TABLE bail_signatures REPLICA IDENTITY FULL;
ALTER TABLE edl_signatures REPLICA IDENTITY FULL;
ALTER TABLE contacts REPLICA IDENTITY FULL;
ALTER TABLE signalements REPLICA IDENTITY FULL;
ALTER TABLE etats_des_lieux REPLICA IDENTITY FULL;
ALTER TABLE loyers REPLICA IDENTITY FULL;

-- 5) Affichage final
SELECT pubname, pubinsert, pubupdate, pubdelete FROM pg_publication WHERE pubname = 'supabase_realtime';

SELECT rolname, rolcanlogin, rolreplication
FROM pg_roles
WHERE rolname = 'supabase_realtime_admin';
