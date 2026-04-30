-- Migration 049 — Colonnes de tracking pour les notifs de retard de loyer.
--
-- V53.3 : cron quotidien `/api/cron/loyers-retard` envoie un rappel email
-- au locataire ET au proprio à J+5 (1er rappel) puis J+15 (rappel
-- formel). Pour éviter de re-spam à chaque exécution du cron, on
-- timestamp les envois.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.loyers
  ADD COLUMN IF NOT EXISTS notified_retard_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS notified_retard_15_at timestamptz NULL;

-- Index pour scan rapide du cron : on cherche les loyers `déclaré`
-- dont notified_retard_at est null (premier rappel pas encore envoyé)
-- ou notified_retard_15_at est null (deuxième rappel pas encore envoyé).
CREATE INDEX IF NOT EXISTS idx_loyers_retard_pending
  ON public.loyers (statut, mois)
  WHERE statut = 'déclaré';

COMMENT ON COLUMN public.loyers.notified_retard_at IS
  'V53.3 — timestamp du 1er rappel email J+5 (locataire + proprio). NULL si non envoyé.';
COMMENT ON COLUMN public.loyers.notified_retard_15_at IS
  'V53.3 — timestamp du 2e rappel email J+15 (rappel formel + mention recouvrement).';
