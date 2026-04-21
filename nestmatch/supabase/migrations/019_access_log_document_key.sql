-- ═══════════════════════════════════════════════════════════════════
-- Migration 019 — Ajout du champ `document_key` à dossier_access_log.
-- ═══════════════════════════════════════════════════════════════════
--
-- Permet de distinguer "consultation de la page index" vs "ouverture
-- d'une pièce justificative précise". Le locataire voit ainsi dans son
-- panneau Consultations non seulement qui a regardé son dossier mais
-- aussi quelles pièces ont été ouvertes.
--
-- Colonne nullable : les enregistrements existants restent intacts
-- (NULL = consultation de la page partage, pas d'une pièce spécifique).
-- RGPD : purgée avec le reste des logs à 90 jours via la fonction
-- purge_dossier_access_log_old() déjà en place.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE dossier_access_log
  ADD COLUMN IF NOT EXISTS document_key text;

COMMENT ON COLUMN dossier_access_log.document_key IS
  'Clé de la pièce consultée (ex: identite, bulletins). NULL = vue de la page partage. Purgé à 90 jours.';

NOTIFY pgrst, 'reload schema';
