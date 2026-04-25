-- Migration 019 : format de visite (physique vs visio)
--
-- Permet au locataire de demander une visite en visio plutôt qu'en physique
-- (utile pour pré-sélection à distance, situations sanitaires, mobilité pro
-- vers une autre région).
--
-- - Default 'physique' (comportement existant inchangé pour toutes les
--   visites antérieures à cette migration).
-- - Champ texte avec CHECK pour éviter les valeurs sauvages.
-- - Pas de NOT NULL strict : tolère les anciennes lignes sans format.

ALTER TABLE public.visites
  ADD COLUMN IF NOT EXISTS format text DEFAULT 'physique'
    CHECK (format IS NULL OR format IN ('physique', 'visio'));

-- Backfill : toutes les visites existantes sont considérées physiques.
UPDATE public.visites SET format = 'physique' WHERE format IS NULL;

NOTIFY pgrst, 'reload schema';
