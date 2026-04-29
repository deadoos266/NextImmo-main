-- Migration 038 — V32.6/V32.7 (Paul 2026-04-29)
-- Audit produit V31 R1.6 (rappels J+3/J+7) + R1.7 (bouton renvoyer email).
--
-- Ajoute le tracking du dernier rappel envoyé pour le bail. Permet :
-- 1. Bouton manuel "Renvoyer l'invitation" côté proprio (UI rate-limit
--    naturel : on n'autorise pas un re-envoi si bail_relance_at < 24h).
-- 2. Auto-rappels J+3 / J+7 (silent fetch au mount du dashboard proprio).
--
-- Idempotente.

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS bail_relance_at timestamptz;

COMMENT ON COLUMN public.annonces.bail_relance_at IS
  'V32 — timestamp de la dernière relance signature envoyée au locataire. '
  'Utilisé pour rate-limit le bouton manuel ET déclencher les rappels auto J+3/J+7.';
