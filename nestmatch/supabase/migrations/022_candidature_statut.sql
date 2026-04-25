-- Migration 022 : statut explicite des candidatures
--
-- Avant : statut "dérivé" côté client (cascade bail > visite > rejete > ...).
-- Aucune persistance d'une décision proprio "présélection" entre la
-- candidature reçue et la signature du bail.
--
-- Après : `messages.statut_candidature` permet au proprio de "valider"
-- explicitement une candidature, ce qui débloque le droit pour ce
-- locataire de proposer une visite (côté fiche annonce + messagerie).
-- Sans validation, le bouton est grisé et au clic affiche un popup
-- "Le propriétaire doit valider votre candidature avant".
--
-- Valeurs : 'en_attente' | 'validee' | 'refusee' | NULL (non-candidature)
-- NULL pour tous les messages ordinaires + candidatures historiques (le
-- proprio peut valider rétroactivement).

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS statut_candidature text
    CHECK (statut_candidature IS NULL OR statut_candidature IN ('en_attente', 'validee', 'refusee'));

-- Index partiel ciblé : on ne requête le statut qu'au sein des candidatures
-- d'un proprio donné sur une annonce donnée. Index unique pour éviter les
-- doublons (le 1er message d'une candidature porte le statut, pas les autres).
CREATE INDEX IF NOT EXISTS idx_messages_statut_candidature
  ON public.messages (to_email, annonce_id, statut_candidature)
  WHERE type = 'candidature';

NOTIFY pgrst, 'reload schema';
