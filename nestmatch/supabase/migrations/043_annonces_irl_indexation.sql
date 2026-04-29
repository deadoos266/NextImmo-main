-- Migration 043 — V34.6 (Paul 2026-04-29)
-- Audit produit V31 R3.3 : indexation IRL annuelle automatique.
--
-- Ajoute le tracking de la dernière indexation IRL appliquée au bail.
-- Permet :
--   1. Anti double-indexation (pas plus d'1× tous les 11 mois).
--   2. Affichage notif "Nouvelle indexation possible" au bon anniversaire.
--   3. Stockage de l'IRL référence du bail (initial, pour calcul futurs).
--
-- Idempotente.

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS irl_reference_initial numeric,
  ADD COLUMN IF NOT EXISTS irl_reference_courant numeric,
  ADD COLUMN IF NOT EXISTS irl_derniere_indexation_at timestamptz;

COMMENT ON COLUMN public.annonces.irl_reference_initial IS
  'V34 — IRL de référence à la signature du bail (ex 144.50). Source de vérité pour calcul historique.';
COMMENT ON COLUMN public.annonces.irl_reference_courant IS
  'V34 — IRL courant après dernière indexation (= initial si jamais indexé).';
COMMENT ON COLUMN public.annonces.irl_derniere_indexation_at IS
  'V34 — timestamp de la dernière application d''indexation IRL (anti double-index).';
