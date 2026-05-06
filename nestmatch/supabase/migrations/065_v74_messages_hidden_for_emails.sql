-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 065 — V74 : soft-delete personnel des conversations
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V74.1)
-- Date: 2026-05-06
-- Status: ✅ MIGRATION READY — APPLIQUER après deploy V74.1 en prod
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- Permet à un user de "supprimer" une conversation côté lui sans impacter
-- l'autre partie (UX iOS Mail / WhatsApp standard). Implémentation : array
-- d'emails dans messages.hidden_for_emails. Quand l'user A masque une
-- conversation avec B, on ajoute A dans hidden_for_emails pour TOUS les
-- messages de cette paire (A→B et B→A). B continue de voir tous les
-- messages côté lui.
--
-- L'affichage filtre en JS : `messages.filter(m => !m.hidden_for_emails?.includes(session.email))`
-- (TODO V75 : intégrer côté messages/page.tsx).
--
-- Idempotent.

BEGIN;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS hidden_for_emails text[] NOT NULL DEFAULT '{}'::text[];

-- Index GIN pour les WHERE NOT (email = ANY(hidden_for_emails)) côté query.
-- Couvre aussi les futurs filtres par utilisateur masquant.
CREATE INDEX IF NOT EXISTS idx_messages_hidden_for_emails
  ON public.messages USING GIN (hidden_for_emails);

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── VÉRIFICATION POST-APPLY ───────────────────────────────────────────────
--
-- Schema check :
--   \d messages    -- hidden_for_emails text[] NOT NULL DEFAULT '{}'
--   \di idx_messages_hidden_for_emails
--
-- Test :
--   UPDATE messages
--      SET hidden_for_emails = array_append(hidden_for_emails, 'paul@test.com')
--    WHERE (from_email = 'paul@test.com' AND to_email = 'autre@test.com')
--       OR (from_email = 'autre@test.com' AND to_email = 'paul@test.com');
--
--   SELECT id, hidden_for_emails FROM messages
--    WHERE 'paul@test.com' = ANY(hidden_for_emails) LIMIT 5;
--
-- Test côté query restitution (à implémenter V75 dans /api/messages/list) :
--   SELECT * FROM messages
--    WHERE NOT ('paul@test.com' = ANY(COALESCE(hidden_for_emails, '{}')));
