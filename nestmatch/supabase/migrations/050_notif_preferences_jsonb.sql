-- Migration 050 — Préférences notifs email granulaires (V54).
--
-- Avant V54 : 4 toggles très larges (notif_messages_email,
-- notif_visites_email, notif_candidatures_email, notif_loyer_retard_email).
-- User a demandé : "il faudrait pouvoir en tant que locataire ou proprio
-- de choisir les emails qu'on veut recevoir".
--
-- Maintenant : 1 colonne `notif_preferences jsonb` qui stocke le mapping
-- { event_type: boolean } pour chaque type d'event email du dispatcher
-- /api/notifications/event + crons.
--
-- Backward-compat : les 4 colonnes legacy restent (pas de DROP) pour ne
-- pas casser les routes qui les lisent encore. Le dispatcher V54 lit
-- d'abord notif_preferences[event] puis fallback sur la colonne legacy
-- correspondante puis true.
--
-- Idempotent.

ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS notif_preferences jsonb DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN public.profils.notif_preferences IS
  'V54 — préférences notifs email granulaires. Format : { event_type: boolean }. '
  'Si event absent, fallback sur notif_*_email legacy puis true. '
  'Events couverts : bail_envoye, bail_signe_partial, bail_actif, bail_refus, '
  'visite_proposee, visite_confirmee, visite_annulee, visite_rappel_j1, '
  'dossier_demande, dossier_partage, dossier_revoque, '
  'candidature_validee, candidature_refusee, candidatures_digest, '
  'loyer_attendu, loyer_retard_j5, loyer_retard_j15, loyer_paye, '
  'irl_proposition, preavis_donne, preavis_jalon, '
  'edl_a_signer, edl_conteste, '
  'avenant_propose, avenant_signe, message_recu.';

-- Index GIN pour les queries qui filtrent par préférence (anti scan complet
-- si un cron veut "tous les profils où notif_preferences->>'loyer_retard_j5'
-- != 'false'"). Couvre les 4 crons de V53.
CREATE INDEX IF NOT EXISTS idx_profils_notif_preferences_gin
  ON public.profils USING gin (notif_preferences);
