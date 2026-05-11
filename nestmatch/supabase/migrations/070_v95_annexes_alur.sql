-- V95.A.1 — Annexes ALUR obligatoires au bail (loi 89-462 art. 3 + décret 2015-587).
--
-- Quand un proprio importe un bail existant, on doit pouvoir tracer la
-- présence (ou non) des 4 annexes obligatoires :
--   - DPE (Diagnostic de Performance Énergétique) — obligatoire depuis 2007
--   - ERP (État des Risques et Pollutions) — obligatoire si zone à risque
--   - CREP (Constat Risque Exposition Plomb) — obligatoire si construction < 1949
--   - Notice d'information (décret 2015-587) — résumé droits/obligations
--
-- Structure de la colonne `annexes_alur` :
--   {
--     "dpe":           { "url": "https://...", "included_in_bail": false },
--     "erp":           { "url": null,          "included_in_bail": true  },
--     "crep":          { "url": null,          "included_in_bail": false, "not_required": true },
--     "notice_info":   { "url": "https://...", "included_in_bail": false }
--   }
--
-- - `url` : URL Supabase Storage du PDF de l'annexe (bucket `baux/<proprio>/annexes/`)
-- - `included_in_bail` : true si l'annexe est intégrée directement dans le PDF principal du bail
-- - `not_required` : true si l'annexe n'est pas requise (ex: CREP pour bâtiment > 1949)
--
-- Au moins UN des trois (url OR included_in_bail OR not_required) doit être true
-- pour considérer l'annexe comme "OK" côté conformité.

BEGIN;

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS annexes_alur jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Index optionnel sur la présence (utile pour stats admin)
CREATE INDEX IF NOT EXISTS idx_annonces_annexes_alur ON public.annonces USING gin (annexes_alur);

COMMENT ON COLUMN public.annonces.annexes_alur IS
  'V95.A.1 — Annexes ALUR obligatoires (DPE, ERP, CREP, notice info). JSON struct avec url/included_in_bail/not_required par annexe. Loi 89-462 art. 3.';

NOTIFY pgrst, 'reload schema';

COMMIT;
