-- =============================================================================
-- 012_notifications.sql
--
-- Cloche de notifications in-app : table persistante qui garde un historique
-- des événements importants par user, indépendamment des toasts éphémères
-- (ToastStack). Permet de retrouver un event loupé sans scroll infini dans
-- /messages ou /visites.
--
-- RLS : non activée (mode actuel NestMatch). La sécurité repose sur l'API
-- route /api/notifications qui filtre par session.user.email. Aucun client
-- browser ne lit directement cette table en anon.
--
-- Idempotent : IF NOT EXISTS partout.
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id          bigserial PRIMARY KEY,
  user_email  text NOT NULL,
  -- type discriminant : message | visite_proposee | visite_confirmee | visite_annulee
  --                    | location_acceptee | location_refusee | loyer_retard
  --                    | bail_genere | dossier_consulte | candidature_retiree
  type        text NOT NULL,
  title       text NOT NULL,
  body        text,
  href        text,
  related_id  text,
  lu          boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Feed principal : les 30 dernières par user, order DESC.
CREATE INDEX IF NOT EXISTS idx_notif_user_email
  ON notifications (user_email, created_at DESC);

-- Compteur badge : count des non-lues par user — index partiel très léger.
CREATE INDEX IF NOT EXISTS idx_notif_unread
  ON notifications (user_email) WHERE lu = false;

NOTIFY pgrst, 'reload schema';
