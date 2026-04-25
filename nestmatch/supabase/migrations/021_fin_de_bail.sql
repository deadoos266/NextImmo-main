-- Migration 021 : workflow fin de bail / sortie locataire
--
-- Permet de basculer une annonce en statut "loue_termine" (= ancien bien)
-- en conservant tout l'historique : annonce, photos, échanges messagerie,
-- quittances émises, EDL, bail signé.
--
-- Côté proprio : "Mes anciens biens" (filtre statut = 'loue_termine').
-- Côté locataire : "Anciens logements" (table profils.anciens_logements
-- jsonb avec [{ annonce_id, bail_termine_at, locataire_email_at_end }]).
--
-- L'auto_paiement_actif est forcé à false au moment du basculement pour
-- arrêter les confirmations automatiques de loyer.

-- 1. Étendre le CHECK constraint sur annonces.statut
ALTER TABLE public.annonces
  DROP CONSTRAINT IF EXISTS annonces_statut_check;

ALTER TABLE public.annonces
  ADD CONSTRAINT annonces_statut_check
  CHECK (statut IS NULL OR statut IN ('disponible', 'bail_envoye', 'loué', 'loue_termine'));

-- 2. Colonnes traçabilité fin de bail
ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS bail_termine_at timestamptz,
  ADD COLUMN IF NOT EXISTS locataire_email_at_end text;

-- 3. Stocke côté locataire la liste de ses anciens logements (jsonb).
-- Format : [{ annonce_id: int, bail_termine_at: text, titre: text, ville: text }]
ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS anciens_logements jsonb DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
