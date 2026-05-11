-- P3-2.A — Alertes matching locataire (V97.12)
--
-- Permet à un locataire de s'abonner à des notifications email quand une
-- nouvelle annonce matche ses critères (budget, surface, ville, etc.
-- déjà dans la table profils).
--
-- DESIGN : on ne crée PAS de colonne `alertes_actives` redondante.
-- Le consentement utilisateur passe par le système existant `notif_preferences`
-- (jsonb) avec un nouvel event `nouvelle_annonce_match` ajouté au catalogue
-- NOTIF_EVENTS (lib/notifPreferences.ts). Cohérent avec tous les autres
-- toggles email (message_recu, bail_envoye, etc.) qui fonctionnent pareil.
--
-- Seule la colonne `derniere_alerte_envoyee_at` est ajoutée — utilisée par
-- le cron P3-2.B pour ne sélectionner que les annonces créées DEPUIS le
-- dernier envoi, et ne pas spammer plus d'1 email/24h.
--
-- Cf. PHASE_3_ROADMAP.md ligne 60-63.

BEGIN;

ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS derniere_alerte_envoyee_at timestamptz;

COMMENT ON COLUMN public.profils.derniere_alerte_envoyee_at IS
  'P3-2.A — Timestamp du dernier email d''alerte matching envoyé. Utilisé par le cron pour ne sélectionner que les annonces créées DEPUIS cette date et éviter de spammer plus d''1 email/jour par locataire.';

-- Index simple sur la colonne. Le cron filtrera en plus via notif_preferences
-- (non indexable facilement sur jsonb path expression). Permet quand même
-- d'éliminer rapidement les profils déjà notifiés dans les dernières 24h.
CREATE INDEX IF NOT EXISTS idx_profils_derniere_alerte_envoyee_at
  ON public.profils(derniere_alerte_envoyee_at);

NOTIFY pgrst, 'reload schema';

COMMIT;
