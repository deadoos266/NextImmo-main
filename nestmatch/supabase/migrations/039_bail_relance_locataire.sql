-- Migration 039 — V33.4 (Paul 2026-04-29)
-- Audit produit V31 R2.1 : page "Bail en cours" côté locataire avec
-- bouton "Renvoyer un rappel au bailleur".
--
-- Ajoute le tracking du dernier rappel envoyé PAR le locataire AU bailleur
-- (réciproque de bail_relance_at qui trace les rappels proprio→locataire).
-- Permet rate-limit 24h sur ce bouton manuel.
--
-- Idempotente.

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS bail_relance_locataire_at timestamptz;

COMMENT ON COLUMN public.annonces.bail_relance_locataire_at IS
  'V33 — timestamp de la dernière relance envoyée par le locataire au bailleur '
  '(rappel d''envoi du bail OU de contresignature). Rate-limit 24h.';
