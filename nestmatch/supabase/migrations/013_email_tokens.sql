-- =============================================================================
-- 013_email_tokens.sql
--
-- Colonnes nécessaires pour les flows email transactionnels :
--   - Vérification d'adresse email (après signup)
--   - Réinitialisation de mot de passe
--
-- Chaque token est un hex random 48 chars (crypto.randomBytes(24)). Expire
-- 24h pour verify, 1h pour reset (reset plus sensible).
--
-- Idempotent : IF NOT EXISTS partout.
-- =============================================================================

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS email_verify_token     text,
  ADD COLUMN IF NOT EXISTS email_verify_expires   timestamptz,
  ADD COLUMN IF NOT EXISTS reset_password_token   text,
  ADD COLUMN IF NOT EXISTS reset_password_expires timestamptz;

-- Index partiels : seules les lignes avec token actif sont indexées.
-- Lookup O(log n) quand on valide un clic de lien d'email.
CREATE INDEX IF NOT EXISTS idx_users_email_verify_token
  ON users (email_verify_token) WHERE email_verify_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_reset_password_token
  ON users (reset_password_token) WHERE reset_password_token IS NOT NULL;

NOTIFY pgrst, 'reload schema';
