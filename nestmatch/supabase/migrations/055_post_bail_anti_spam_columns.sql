-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 055 — Colonnes anti-spam pour cron /api/cron/post-bail (V57.4 + V57.7)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V57)
-- Date: 2026-04-30
-- Status: READY TO APPLY
--
-- Le cron post-bail envoie 4 types d'emails au plus 1 fois par cible :
--   - merci locataire + clos proprio (J+1 après bail_termine_at)
--   - warning proprio (J+50, avant deadline 60j)
--   - contentieux locataire (J+60+, dépassement délai ALUR)
--
-- Sans ces colonnes, le cron daily refire le même email à chaque exécution.
-- Idempotent.

ALTER TABLE public.historique_baux
  ADD COLUMN IF NOT EXISTS email_post_bail_envoye_at timestamptz;

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS warning_depot_envoye_at timestamptz,
  ADD COLUMN IF NOT EXISTS contentieux_email_envoye_at timestamptz;

COMMENT ON COLUMN public.historique_baux.email_post_bail_envoye_at IS
  'V57.4 — timestamp envoi email "merci locataire + clos proprio" après archivage. NULL = pas encore envoyé.';
COMMENT ON COLUMN public.annonces.warning_depot_envoye_at IS
  'V57.7 — timestamp warning proprio délai dépôt (J+50). NULL = pas envoyé.';
COMMENT ON COLUMN public.annonces.contentieux_email_envoye_at IS
  'V57.7 — timestamp email contentieux locataire (J+60+). NULL = pas envoyé.';

NOTIFY pgrst, 'reload schema';
