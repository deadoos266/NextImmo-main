-- Migration 018 : civilité sur profils (M. / Mme / autre)
--
-- Permet d'accorder dynamiquement le rendu de la nationalité dans le dossier
-- locataire ("Français" vs "Française") et tout autre champ genré ajouté
-- ultérieurement. Nullable pour ne pas bloquer les profils existants.
-- Valeurs attendues côté UI : 'M.' | 'Mme' | null (= non renseigné, défaut M.).

ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS civilite text;

NOTIFY pgrst, 'reload schema';
