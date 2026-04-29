-- Migration 042 — V34.5 (Paul 2026-04-29)
-- Audit produit V31 R3.4 : Préavis (notice) workflow + countdown.
--
-- Permet à locataire OU proprio de donner congé. Délai légal :
--   Locataire : 3 mois (vide), 1 mois (zone tendue ou meublé)
--   Proprio   : 6 mois minimum, motifs sérieux uniquement (vente / reprise / motif sérieux)
--
-- Status flow :
--   bail_actif → preavis_donne → fin_bail (à date_fin_preavis)
--
-- Idempotente.

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS preavis_donne_par text,
  ADD COLUMN IF NOT EXISTS preavis_date_envoi timestamptz,
  ADD COLUMN IF NOT EXISTS preavis_motif text,
  ADD COLUMN IF NOT EXISTS preavis_motif_detail text,
  ADD COLUMN IF NOT EXISTS preavis_date_depart_souhaitee date,
  ADD COLUMN IF NOT EXISTS preavis_fin_calculee date;

COMMENT ON COLUMN public.annonces.preavis_donne_par IS
  'V34 — qui a donné congé : "locataire" ou "proprietaire" (NULL si aucun).';
COMMENT ON COLUMN public.annonces.preavis_date_envoi IS
  'V34 — timestamp d''envoi du préavis (déclenche le countdown).';
COMMENT ON COLUMN public.annonces.preavis_motif IS
  'V34 — code motif : mutation_pro / achat / autre (locataire) ou vente / reprise / motif_serieux (proprio).';
COMMENT ON COLUMN public.annonces.preavis_motif_detail IS
  'V34 — texte libre additionnel (max 500 chars).';
COMMENT ON COLUMN public.annonces.preavis_date_depart_souhaitee IS
  'V34 — date souhaitée par celui qui donne congé (peut être après le préavis légal).';
COMMENT ON COLUMN public.annonces.preavis_fin_calculee IS
  'V34 — date effective de fin de bail = max(date_envoi + délai légal, date_depart_souhaitee).';
