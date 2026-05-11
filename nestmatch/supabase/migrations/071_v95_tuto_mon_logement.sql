-- V95.C.1 — Tuto /mon-logement : timestamp completion locataire.
--
-- Le locataire arrivant pour la 1ère fois sur /mon-logement après acceptance
-- d'un bail (KeyMatch ou importé) voit une visite guidée 4-5 étapes :
--   - Card bail (download PDF + signature légale)
--   - Card quittances (auto-générées mensuelles)
--   - Card EDL (consultation à tout moment)
--   - Section signaler problème (carnet entretien + messages)
--
-- Persistance : timestamp posé via /api/locataire/tuto-mon-logement quand
-- l'user complete OU skip. localStorage en miroir pour éviter le flash
-- côté client.

BEGIN;

ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS tuto_mon_logement_at timestamptz;

COMMENT ON COLUMN public.profils.tuto_mon_logement_at IS
  'V95.C.1 — Timestamp completion du tuto /mon-logement (post-acceptance bail). NULL = pas encore vu.';

NOTIFY pgrst, 'reload schema';

COMMIT;
