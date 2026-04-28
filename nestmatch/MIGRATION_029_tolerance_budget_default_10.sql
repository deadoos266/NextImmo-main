-- =====================================================================
-- MIGRATION 029 — Tolerance budget default 10% (V9.2)
-- Date     : 2026-04-28
-- Tables   : profils (default + UPDATE existing)
-- Idempotent : oui (UPDATE WHERE = 20 ne touche que les profils default-20)
-- =====================================================================
--
-- User feedback : 20% est trop genereux par defaut. Un budget 1500€ qui
-- fait apparaitre des annonces a 1800€ deroute. 10% est plus realiste
-- pour le marche tendu francais. Trade-off accepte : on ecrase aussi les
-- users qui auraient explicitement choisi 20% (12 users en prod, OK).

ALTER TABLE public.profils
  ALTER COLUMN tolerance_budget_pct SET DEFAULT 10;

UPDATE public.profils
SET tolerance_budget_pct = 10
WHERE tolerance_budget_pct = 20;

NOTIFY pgrst, 'reload schema';
