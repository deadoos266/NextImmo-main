-- ═══════════════════════════════════════════════════════════════════
-- Migration 021 — Table `dossier_share_tokens` (liens de partage nommés).
--
-- À coller dans Supabase prod → Dashboard → SQL Editor → New query → Run.
-- Idempotent : peut être relancé sans risque.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dossier_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_locataire TEXT NOT NULL,
  label TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  consultation_count INTEGER NOT NULL DEFAULT 0,
  last_consulted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_dossier_share_tokens_email
  ON dossier_share_tokens(email_locataire, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dossier_share_tokens_hash
  ON dossier_share_tokens(token_hash);

COMMENT ON TABLE dossier_share_tokens IS
  'Liens de partage nommés du dossier locataire. Le token JWT reste stateless (HMAC) — cette table sert au label, à la révocation et aux métriques de consultation.';
COMMENT ON COLUMN dossier_share_tokens.label IS
  'Nom lisible choisi par le locataire (ex : destinataire du lien). 2-80 caractères.';
COMMENT ON COLUMN dossier_share_tokens.token_hash IS
  'SHA-256(token) tronqué 16 chars — même format que dossier_access_log.token_hash pour permettre JOIN.';
COMMENT ON COLUMN dossier_share_tokens.revoked_at IS
  'Si non NULL : lien révoqué, toute consultation renvoie 404. Le JWT reste cryptographiquement valide mais la route refuse.';

NOTIFY pgrst, 'reload schema';
