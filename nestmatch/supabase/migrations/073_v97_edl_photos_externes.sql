-- V97.1 — Permet de joindre des PHOTOS d'EDL externes à un état des lieux.
--
-- Cas d'usage : en complément du PDF EDL externe (V96.1), le proprio peut
-- aussi uploader plusieurs photos prises lors de l'EDL contradictoire
-- réalisé hors plateforme. Ces photos servent de preuves visuelles à
-- conserver et à partager avec le locataire dans la conv `/messages`.
--
-- Format : tableau JSON d'URLs Supabase Storage.
-- Exemple : ["https://.../edl-photos/uuid/photo1.jpg", "...photo2.jpg"]

BEGIN;

ALTER TABLE public.etats_des_lieux
  ADD COLUMN IF NOT EXISTS photos_externes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.etats_des_lieux.photos_externes IS
  'V97.1 — Tableau JSON d''URLs Supabase Storage des photos prises lors de l''EDL contradictoire signé hors plateforme. Complément visuel du pdf_url_externe.';

NOTIFY pgrst, 'reload schema';

COMMIT;
