-- ═══════════════════════════════════════════════════════════════════
-- Migration 021 — Table `dossier_share_tokens` (liens de partage nommés).
-- ═══════════════════════════════════════════════════════════════════
--
-- Le token JWT reste stateless (HMAC sur {email, exp}). Cette table sert
-- UNIQUEMENT à :
--   1. Donner un label lisible à chaque lien (ex : "Mr Dupont — Paris 11")
--   2. Permettre la révocation (`revoked_at`) avant expiration
--   3. Compter les consultations (`consultation_count`, `last_consulted_at`)
--
-- On ne stocke JAMAIS le token brut — uniquement son hash SHA-256 tronqué
-- (même format que `dossier_access_log.token_hash`, permet corrélation).
-- Si la DB fuite, impossible de rejouer les liens actifs.
--
-- Rétrocompat : le code API catch le code PGRST `42P01` (undefined_table)
-- et continue en graceful sans la couche DB — les tokens émis avant
-- l'application de cette migration restent valides tant que le JWT n'a
-- pas expiré (pas d'historique perdu).
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
