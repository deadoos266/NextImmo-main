-- P3-4.A — Accusés de lecture des messages (V97.14)
--
-- Ajoute un timestamp `read_at` à la table messages pour permettre
-- d'afficher "✓ envoyé" vs "✓✓ lu" côté expéditeur (pattern WhatsApp/iMessage).
--
-- État actuel : la colonne `lu boolean` existe déjà depuis V0 et est mise
-- à true par /api/messages/mark-read quand le destinataire ouvre la conv.
-- On enrichit avec un timestamp pour pouvoir afficher "Lu à 14h32" au hover.
--
-- Cf. PHASE_3_ROADMAP.md ligne 99-105 (P3-4).

BEGIN;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

COMMENT ON COLUMN public.messages.read_at IS
  'P3-4.A — Timestamp précis du moment où le destinataire a marqué le message comme lu (via /api/messages/mark-read). NULL = pas encore lu. Permet UI "Lu à 14h32" + tracking délai de lecture.';

NOTIFY pgrst, 'reload schema';

COMMIT;
