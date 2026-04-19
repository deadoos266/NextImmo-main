-- =============================================================================
-- 011_mode_vacances.sql
--
-- Mode vacances propriétaire : toggle qui masque les annonces disponibles du
-- proprio dans la recherche publique et affiche un bandeau sur les fiches.
-- Phase 2 : auto-répondeur dans la messagerie (utilise vacances_message).
--
-- Deux colonnes ajoutées sur `profils` :
--   - vacances_actif   : boolean (default false) — le toggle lui-même
--   - vacances_message : text (null ou <= 400 chars) — message affiché en
--                         fiche annonce et envoyé en auto-réponse
--
-- Idempotent : tout est en IF NOT EXISTS / IF EXISTS.
-- =============================================================================

ALTER TABLE IF EXISTS profils
  ADD COLUMN IF NOT EXISTS vacances_actif  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vacances_message text;

-- Contrainte longueur max sur le message (anti-abus + UI cohérente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_profils_vacances_msg_length'
  ) THEN
    ALTER TABLE profils
      ADD CONSTRAINT chk_profils_vacances_msg_length
      CHECK (vacances_message IS NULL OR length(vacances_message) <= 400);
  END IF;
END $$;

-- Index partiel : ne stocke que les proprios actuellement en vacances.
-- Utile pour le filtre public /annonces qui interroge "qui est en vacances ?".
CREATE INDEX IF NOT EXISTS idx_profils_vacances_actif
  ON profils (email) WHERE vacances_actif = true;

NOTIFY pgrst, 'reload schema';
