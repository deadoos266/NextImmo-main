-- V97.39.21 Phase 4 — Triggers Postgres pg_notify pour remplacer Supabase Realtime
--
-- À appliquer SUR LE POSTGRES VPS (Phase 2 prerequisite). Pas sur Supabase.
-- Sur Supabase, on garde Realtime natif jusqu'au cutover.
--
-- Permet au service tools/realtime-vps de LISTEN sur 4 channels et broadcaster
-- les events aux clients socket.io authentifiés.
--
-- Tables couvertes :
--   - messages       (channel keymatch_messages)
--   - notifications  (channel keymatch_notifications)
--   - visites        (channel keymatch_visites)
--   - annonces       (channel keymatch_annonces)
--
-- Format payload pg_notify (JSON) :
--   { "event": "INSERT" | "UPDATE" | "DELETE", "table": "<name>", "row": <row JSON> }
--
-- Idempotent : CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.

BEGIN;

-- ─── Helper function ──────────────────────────────────────────────
-- Envoie pg_notify sur le channel keymatch_<table> avec le payload structuré.
-- Limite : pg_notify payload max 8000 bytes. Pour les rows volumineuses
-- (annonces.description peut faire 1-2 KB), on tronque les champs > 1 KB.
CREATE OR REPLACE FUNCTION keymatch_notify_change() RETURNS trigger AS $$
DECLARE
  row_json jsonb;
  payload text;
  channel_name text;
BEGIN
  channel_name := 'keymatch_' || TG_TABLE_NAME;

  -- Convertit la ligne en jsonb (NEW pour INSERT/UPDATE, OLD pour DELETE)
  IF TG_OP = 'DELETE' THEN
    row_json := to_jsonb(OLD);
  ELSE
    row_json := to_jsonb(NEW);
  END IF;

  -- Tronque les champs gourmands en bytes pour ne pas exploser la limite
  -- pg_notify (8000 bytes). Liste minimale pour KeyMatch :
  --   - annonces.description  (peut faire >2 KB)
  --   - messages.contenu      (peut faire >5 KB sur les longs)
  IF TG_TABLE_NAME = 'annonces' AND length(coalesce(row_json->>'description','')) > 200 THEN
    row_json := jsonb_set(row_json, '{description}', to_jsonb(left(row_json->>'description', 200) || '…'));
  END IF;
  IF TG_TABLE_NAME = 'messages' AND length(coalesce(row_json->>'contenu','')) > 500 THEN
    row_json := jsonb_set(row_json, '{contenu}', to_jsonb(left(row_json->>'contenu', 500) || '…'));
  END IF;

  payload := jsonb_build_object(
    'event', TG_OP,
    'table', TG_TABLE_NAME,
    'row', row_json
  )::text;

  -- Sanity check : payload trop gros ? on emet juste un signal de refresh
  -- sans la row (le client appellera l'API pour recharger).
  -- V97.39.21 verifier fix : `octet_length` au lieu de `length` car la limite
  -- pg_notify est en BYTES (8000), pas en caractères. UTF-8 avec emojis/accents
  -- peut faire 3-4 bytes par caractère.
  IF octet_length(payload) > 7500 THEN
    payload := jsonb_build_object(
      'event', TG_OP,
      'table', TG_TABLE_NAME,
      'row', jsonb_build_object('id', row_json->>'id'),
      'truncated', true
    )::text;
  END IF;

  PERFORM pg_notify(channel_name, payload);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
  -- V97.39.21 verifier fix : SET search_path explicite pour bloquer
  -- l'attaque search-path hijacking (un user qui crée une fonction
  -- pg_notify dans son schéma pourrait l'exécuter avec les privilèges
  -- DEFINER — postgres superuser).
  SET search_path = pg_catalog, public;

COMMENT ON FUNCTION keymatch_notify_change() IS
  'V97.39.21 P4 — Trigger function pour Realtime self-host (tools/realtime-vps). Émet pg_notify avec payload JSON.';

-- ─── Triggers par table ───────────────────────────────────────────

-- messages (chat + invitations visites)
DROP TRIGGER IF EXISTS keymatch_notify_messages ON messages;
CREATE TRIGGER keymatch_notify_messages
  AFTER INSERT OR UPDATE OR DELETE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION keymatch_notify_change();

-- notifications (badge cloche)
DROP TRIGGER IF EXISTS keymatch_notify_notifications ON notifications;
CREATE TRIGGER keymatch_notify_notifications
  AFTER INSERT OR UPDATE OR DELETE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION keymatch_notify_change();

-- visites (status updates)
DROP TRIGGER IF EXISTS keymatch_notify_visites ON visites;
CREATE TRIGGER keymatch_notify_visites
  AFTER INSERT OR UPDATE OR DELETE ON visites
  FOR EACH ROW
  EXECUTE FUNCTION keymatch_notify_change();

-- annonces (mon-logement updates) — pas DELETE car archive logique
DROP TRIGGER IF EXISTS keymatch_notify_annonces ON annonces;
CREATE TRIGGER keymatch_notify_annonces
  AFTER INSERT OR UPDATE ON annonces
  FOR EACH ROW
  EXECUTE FUNCTION keymatch_notify_change();

-- ─── Test de sanity ───────────────────────────────────────────────
-- Vérifier que les triggers sont bien créés :
--   SELECT trigger_name, event_object_table, action_timing, event_manipulation
--   FROM information_schema.triggers
--   WHERE trigger_name LIKE 'keymatch_notify_%'
--   ORDER BY event_object_table;

-- Test fire manuel (à exécuter depuis psql, dans une autre connexion en LISTEN) :
--   -- Term 1 : psql ... -c "LISTEN keymatch_notifications;"
--   -- Term 2 : INSERT INTO notifications (...) VALUES (...);
--   -- Term 1 doit afficher : NOTIFY keymatch_notifications, "{...}"

COMMIT;
