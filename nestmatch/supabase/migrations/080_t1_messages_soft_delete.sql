-- T1 — Soft delete des messages (V97.26)
--
-- Ajoute `messages.deleted_at` pour permettre :
--   - Undo conv : "Annuler" pendant 5s après suppression
--   - Audit trail : on retient quand un message a été supprimé
--   - Re-restore admin si besoin (jamais effacé physiquement)
--
-- Tous les SELECT messages doivent filtrer `.is("deleted_at", null)` pour
-- exclure les soft-deleted. Le cron de purge physique (hors scope T1) pourra
-- DELETE les rows deleted_at < now() - 30 days plus tard.

BEGIN;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.messages.deleted_at IS
  'T1 V97.26 — Timestamp du soft delete (NULL = visible). Permet undo + audit. Cron purge physique des rows deleted_at < now() - 30 days à implémenter plus tard.';

-- Index partiel pour filter rapide "non supprimé" sur les SELECT fréquents
CREATE INDEX IF NOT EXISTS idx_messages_active
  ON public.messages(created_at DESC)
  WHERE deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
