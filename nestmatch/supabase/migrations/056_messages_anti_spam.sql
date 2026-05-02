-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 056 — Anti-spam emails messages : last_seen + batch debounce
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V59)
-- Date: 2026-04-30
-- Status: READY TO APPLY
--
-- User : "c'est assez relou et ca va faire beaucoup de mail si a chaque
-- message qeu quelqu'un envoie ca fait un mail non ? je trouve ca tres relou".
--
-- Pattern Slack/Linear :
--   - Si receiver online (last_seen < 10 min) → pas d'email (notif in-app)
--   - Si offline → email mais batch debounce 5 min par conversation
--   - Option digest quotidien 8h (opt-in via notif_preferences)
--
-- Idempotent.

BEGIN;

-- ─── 1. profils.last_seen_at — heartbeat client ────────────────────────────

ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN public.profils.last_seen_at IS
  'V59 — timestamp dernier heartbeat client (POST /api/profil/heartbeat toutes 60s '
  'sur les pages authentifiées). Si récent (< 10 min), pas d''email pour les '
  'nouveaux messages — l''user voit la notif in-app.';

-- Index pour les queries fréquentes (cron digest scan tous les profils)
CREATE INDEX IF NOT EXISTS idx_profils_last_seen
  ON public.profils (last_seen_at DESC NULLS LAST)
  WHERE last_seen_at IS NOT NULL;

-- ─── 2. Table messages_emails_log — batch debounce ──────────────────────────

CREATE TABLE IF NOT EXISTS public.messages_emails_log (
  id                bigserial PRIMARY KEY,
  receiver_email    text NOT NULL,
  conversation_key  text NOT NULL,  -- format : "<from>::<to>::<annonce_id|null>"
  sent_at           timestamptz NOT NULL DEFAULT now(),
  -- last_digest_at marque l'envoi du digest quotidien pour ce receiver
  last_digest_at    timestamptz
);

-- Index pour lookup rapide (le check anti-spam fait : "le dernier email
-- envoyé à ce receiver pour cette conv est-il < 5 min ?")
CREATE INDEX IF NOT EXISTS idx_msg_emails_log_receiver_conv
  ON public.messages_emails_log (receiver_email, conversation_key, sent_at DESC);

-- Index pour le cron digest (scan par receiver, last_digest_at)
CREATE INDEX IF NOT EXISTS idx_msg_emails_log_digest
  ON public.messages_emails_log (receiver_email, last_digest_at DESC NULLS LAST);

COMMENT ON TABLE public.messages_emails_log IS
  'V59 — log des emails envoyés pour les messages, sert au batch debounce '
  '(5 min/conversation) et au cron digest quotidien (anti-spam).';

-- ─── 3. RLS strict — aucun accès anon, lecture/écriture via supabaseAdmin ──

REVOKE ALL ON TABLE public.messages_emails_log FROM anon;
REVOKE ALL ON TABLE public.messages_emails_log FROM authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Vérification post-apply :
-- SELECT count(*) FROM messages_emails_log;  -- 0 (OK, table créée vide)
-- SELECT column_name FROM information_schema.columns WHERE table_name='profils' AND column_name='last_seen_at';
