-- Migration 041 — V34.3 (Paul 2026-04-29)
-- Audit produit V31 R3.7 : onboarding proprio walkthrough 3 écrans
-- "Comment fonctionne le bail KeyMatch".
--
-- Idempotente.

ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS tuto_proprio_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS tuto_proprio_skipped_at timestamptz;

COMMENT ON COLUMN public.profils.tuto_proprio_completed_at IS
  'V34 — timestamp de fin du walkthrough onboarding proprio (3 écrans). '
  'Si NULL ET tuto_proprio_skipped_at NULL ET au moins une annonce → afficher.';

COMMENT ON COLUMN public.profils.tuto_proprio_skipped_at IS
  'V34 — timestamp de skip volontaire du tuto proprio. Le tuto reste accessible '
  'depuis le menu user mais ne se déclenche plus automatiquement.';
