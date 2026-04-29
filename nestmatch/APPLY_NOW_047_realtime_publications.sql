-- APPLY NOW (idempotent) — Migration 047 Realtime publications.
-- À copier-coller dans Supabase Dashboard > SQL Editor > New query > Run.
-- Active Realtime sur les tables critiques pour que les events INSERT/UPDATE
-- atteignent les clients abonnés (utilisé par /messages, /mon-logement,
-- /proprietaire/bail).
--
-- Bug user V50.8 : "je recois pas en temps reel le bail faut je reload la page"
-- → la logique client était déjà câblée mais les tables n'étaient pas
--    dans la publication `supabase_realtime`.

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE bail_signatures; EXCEPTION WHEN OTHERS THEN NULL; END;
  ALTER PUBLICATION supabase_realtime ADD TABLE bail_signatures;

  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE edl_signatures; EXCEPTION WHEN OTHERS THEN NULL; END;
  ALTER PUBLICATION supabase_realtime ADD TABLE edl_signatures;

  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE etats_des_lieux; EXCEPTION WHEN OTHERS THEN NULL; END;
  ALTER TABLE etats_des_lieux REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE etats_des_lieux;

  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE annonces; EXCEPTION WHEN OTHERS THEN NULL; END;
  ALTER TABLE annonces REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE annonces;

  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE visites; EXCEPTION WHEN OTHERS THEN NULL; END;
  ALTER TABLE visites REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE visites;

  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE messages; EXCEPTION WHEN OTHERS THEN NULL; END;
  ALTER TABLE messages REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
END$$;

-- Vérifier que tout est bien dans la publication :
-- SELECT pubname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;
