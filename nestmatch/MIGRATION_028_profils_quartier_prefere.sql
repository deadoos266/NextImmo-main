-- =====================================================================
-- MIGRATION 028 — Profils quartier prefere (V7 chantier 2)
-- Date     : 2026-04-28
-- Tables   : profils (+3 colonnes : quartier_prefere_lat/lng/label)
-- Idempotent : oui
-- =====================================================================
--
-- Permet au candidat de poser un marker sur SON quartier favori (Leaflet
-- picker /profil). Le matching utilise ces lat/lng pour scorer la
-- proximite reelle au lieu de \"meme ville\" uniforme. V2.3 rayon depuis
-- ville reste fallback si quartier_prefere null.

ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS quartier_prefere_lat numeric,
  ADD COLUMN IF NOT EXISTS quartier_prefere_lng numeric,
  ADD COLUMN IF NOT EXISTS quartier_prefere_label text;

COMMENT ON COLUMN public.profils.quartier_prefere_lat IS
  'Latitude du quartier favori du candidat. Permet un score de proximite plus fin que la ville seule.';
COMMENT ON COLUMN public.profils.quartier_prefere_lng IS
  'Longitude du quartier favori du candidat. Couple avec quartier_prefere_lat.';
COMMENT ON COLUMN public.profils.quartier_prefere_label IS
  'Label humain du quartier favori (ex. "Bastille, Paris 11e"). Affiche dans /profil.';

NOTIFY pgrst, 'reload schema';
