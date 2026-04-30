-- Migration 052 — Tuto onboarding locataire (V55.2).
--
-- Miroir du tuto proprio (V34.3, mig 041). Permet de suivre si un user
-- locataire a vu / skip / refait la visite guidée post-signup.
--
-- Idempotent.

ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS tuto_locataire_completed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS tuto_locataire_skipped_at timestamptz NULL;

COMMENT ON COLUMN public.profils.tuto_locataire_completed_at IS
  'V55.2 — timestamp de fin du walkthrough onboarding locataire post-signup.';
COMMENT ON COLUMN public.profils.tuto_locataire_skipped_at IS
  'V55.2 — timestamp de skip du walkthrough locataire (peut être null si refait via menu).';
