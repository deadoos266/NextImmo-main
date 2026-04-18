-- =============================================================================
-- 008_parametres_profil_public.sql
--
-- Champs d'affichage public (bio, photo custom) + préférences notifications.
-- Supporte la future page /parametres.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE IF EXISTS profils
  ADD COLUMN IF NOT EXISTS bio_publique              text,
  ADD COLUMN IF NOT EXISTS photo_url_custom          text,
  ADD COLUMN IF NOT EXISTS notif_messages_email      boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_visites_email       boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_candidatures_email  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_loyer_retard_email  boolean DEFAULT true;

-- Limite longueur bio (défense en profondeur — client valide aussi)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_profils_bio_length') THEN
    ALTER TABLE profils ADD CONSTRAINT chk_profils_bio_length
      CHECK (bio_publique IS NULL OR length(bio_publique) <= 300);
  END IF;
END $$;

COMMENT ON COLUMN profils.photo_url_custom IS 'URL photo uploadée via /api/account/avatar. Priorité sur users.image (Google OAuth). NULL = utilise la photo Google.';
COMMENT ON COLUMN profils.bio_publique IS 'Bio courte affichée sur le profil public (vue proprio). Max 300 caractères.';
