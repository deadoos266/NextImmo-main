-- Migration 017 : Auto-paiement mensuel (virement automatique du locataire)
--
-- Le locataire signale qu'il a mis en place un virement auto → proprio valide
-- → chaque mois, le loyer se confirme automatiquement (créé par un trigger
--   page-load côté client, pas de cron).
-- Le proprio peut toujours contester un mois donné si le virement a échoué.

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS auto_paiement_actif       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_paiement_confirme_at timestamptz;

NOTIFY pgrst, 'reload schema';
