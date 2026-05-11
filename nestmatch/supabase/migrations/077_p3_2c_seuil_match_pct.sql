-- P3-2.C — Seuil % match configurable pour alertes matching (V97.15)
--
-- Paul demande : "le mail auto, faut que on puisse définir à partir de
-- combien de % on veut le mail". Avant : hardcoded à 60% (MIN_SCORE=600/1000)
-- dans /api/cron/alertes-matching. Maintenant : configurable par profil
-- via UI dans /parametres OngletCompte (V97.15).
--
-- Range autorisé : 30-95% (sous 30 = bruit, au-dessus 95 = quasi rien
-- ne match jamais).

BEGIN;

ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS seuil_match_pct integer NOT NULL DEFAULT 60
  CHECK (seuil_match_pct >= 30 AND seuil_match_pct <= 95);

COMMENT ON COLUMN public.profils.seuil_match_pct IS
  'P3-2.C — Seuil minimum (%) pour qu''une annonce déclenche un email d''alerte. Default 60. Range 30-95. Plus haut = moins d''emails mais matches plus précis.';

NOTIFY pgrst, 'reload schema';

COMMIT;
