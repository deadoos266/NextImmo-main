-- =====================================================================
-- MIGRATION 026 — Matching v2 schema
-- Date     : 2026-04-27
-- Tables   : profils (4 nouvelles colonnes + backfill revenus_mensuels_nets)
-- Idempotent : oui — peut être rejouée sans risque
-- =====================================================================

-- 1) Nouvelles colonnes profils pour le matching v2
ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS preferences_equipements jsonb,
  ADD COLUMN IF NOT EXISTS revenus_mensuels_nets numeric,
  ADD COLUMN IF NOT EXISTS dpe_min_actif boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tolerance_budget_pct integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS rayon_recherche_km integer;

-- 2) Backfill revenus_mensuels_nets depuis revenus_mensuels (assumption :
--    les revenus collectes jusqu'a maintenant etaient nets — 99% des cas
--    en France quand on parle "revenus mensuels" sans qualifier).
UPDATE public.profils
SET revenus_mensuels_nets = revenus_mensuels::numeric
WHERE revenus_mensuels_nets IS NULL
  AND revenus_mensuels IS NOT NULL
  AND revenus_mensuels::text ~ '^[0-9]+(\.[0-9]+)?$';

-- 3) Comments pour documentation schema
COMMENT ON COLUMN public.profils.preferences_equipements IS
  'JSONB tri-state per equipement : { parking: "indispensable"|"souhaite"|"indifferent"|"refuse", balcon: ..., ... }. Remplace progressivement les booleans (parking, cave, balcon, etc.) qui restent en colonnes pour compat ascendante MVP.';
COMMENT ON COLUMN public.profils.revenus_mensuels_nets IS
  'Revenus mensuels NETS du candidat. Renomme la colonne ambigue revenus_mensuels (qui ne precisait pas net/brut). Utilise par screening.ts pour le calcul du ratio solvabilite.';
COMMENT ON COLUMN public.profils.dpe_min_actif IS
  'Si true, le DPE minimum (dpe_min) est utilise comme filtre dur dans matching.ts (annonces avec DPE pire sont exclues). Si false, le DPE est juste un bonus de score. Default false pour ne pas casser la decouverte d''annonces.';
COMMENT ON COLUMN public.profils.tolerance_budget_pct IS
  'Tolerance budget en pourcentage. Default 20 (annonces jusqu''a budget x 1.20 sont visibles, au-dela exclues). User-controlled via slider /profil.';
COMMENT ON COLUMN public.profils.rayon_recherche_km IS
  'Rayon de recherche geographique en km depuis ville_souhaitee. Si defini, score bonus geographique (haversine) applique aux annonces dans le rayon. Si null, pas de bonus geo (filtre ville classique).';

-- 4) Reload du cache PostgREST
NOTIFY pgrst, 'reload schema';
