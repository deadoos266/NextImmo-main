-- Migration 047 — Active Supabase Realtime sur les tables critiques du flow
-- bail / EDL pour que /messages et /mon-logement reçoivent les events INSERT
-- et UPDATE sans avoir besoin de reload.
--
-- Bug user V50.8 : "je recois pas en temps reel le bail faut je reload la
-- page". Quand le bailleur contre-signe, le locataire doit voir BAIL_SIGNE
-- + cards apparaître live. La logique client est déjà câblée
-- (app/messages/page.tsx l. 1681 + app/mon-logement/page.tsx l. 240) mais
-- les tables n'étaient pas dans la publication `supabase_realtime` →
-- les events ne sortent pas du DB.
--
-- Idempotent : on retire-puis-ajoute pour éviter les "already in publication".
--
-- ⚠ REPLICA IDENTITY FULL est nécessaire sur les UPDATE pour que payload.old
-- soit complet (sinon on n'a que la PK). On le force sur les tables
-- mises à jour (annonces, etats_des_lieux).

DO $$
BEGIN
  -- bail_signatures : INSERT only (les signatures sont write-once)
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE bail_signatures;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  ALTER PUBLICATION supabase_realtime ADD TABLE bail_signatures;

  -- edl_signatures : INSERT only
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE edl_signatures;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  ALTER PUBLICATION supabase_realtime ADD TABLE edl_signatures;

  -- etats_des_lieux : UPDATE pour le statut "valide" → REPLICA FULL
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE etats_des_lieux;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  ALTER TABLE etats_des_lieux REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE etats_des_lieux;

  -- annonces : UPDATE (statut "loué", bail_envoye, dates de signature) →
  -- REPLICA FULL pour que payload.new soit complet côté client.
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE annonces;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  ALTER TABLE annonces REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE annonces;

  -- visites : INSERT/UPDATE pour la conv timeline
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE visites;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  ALTER TABLE visites REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE visites;

  -- messages : INSERT/DELETE/UPDATE — déjà actif normalement, on idempotente
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE messages;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  ALTER TABLE messages REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
END$$;
