-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 061 — V69 colonnes + trigger DB integrity bail signatures
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V69.3)
-- Date: 2026-05-05
-- Status: ✅ MIGRATION READY — APPLIQUER après déploiement V69.1+V69.2
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- 1. Colonnes manquantes utilisées par les routes V69.1 + crons V69.2
-- 2. Trigger PostgreSQL `reset_annonce_signature_on_delete` qui sync
--    `annonces.bail_signe_*_at` quand une row `bail_signatures` est DELETE.
--
-- Tout est idempotent (IF NOT EXISTS / CREATE OR REPLACE).
--
-- ─── COLONNES AJOUTÉES ─────────────────────────────────────────────────────

BEGIN;

-- V69.2a — cron depot-retard : flag anti-spam (1 notif/bail)
ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS notified_depot_retard_at timestamptz;

-- V69.2b — cron annonces-stagnantes : flag anti-spam (1 notif/3 mois)
ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS notified_stagnant_at timestamptz;

-- V69.2c — cron verify-integrity-baux : flag tampering détecté
ALTER TABLE public.bail_signatures
  ADD COLUMN IF NOT EXISTS integrity_check_failed_at timestamptz;

-- V69.1d — workflow contestation EDL formel
ALTER TABLE public.etats_des_lieux
  ADD COLUMN IF NOT EXISTS items_contestes jsonb,
  ADD COLUMN IF NOT EXISTS contestation_date timestamptz,
  ADD COLUMN IF NOT EXISTS contestation_message text;

-- ─── TRIGGER reset_annonce_signature_on_delete ──────────────────────────
--
-- Quand une signature bail est DELETE (admin cleanup, RGPD effacement,
-- correction erreur), reset le timestamp correspondant sur l'annonce
-- pour éviter les annonces stuck "loué" sans signatures réelles en DB.
--
-- V67 audit avait identifié ce gap : la détection passive via
-- /api/bail/[annonceId]/verify-integrity ne corrigeait pas le state
-- côté annonces. Maintenant : sync DB-level garanti.

CREATE OR REPLACE FUNCTION public.reset_annonce_signature_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.signataire_role = 'locataire' THEN
    UPDATE public.annonces
       SET bail_signe_locataire_at = NULL
     WHERE id = OLD.annonce_id;
  ELSIF OLD.signataire_role = 'bailleur' THEN
    UPDATE public.annonces
       SET bail_signe_bailleur_at = NULL
     WHERE id = OLD.annonce_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reset_annonce_signature_on_delete ON public.bail_signatures;
CREATE TRIGGER trg_reset_annonce_signature_on_delete
AFTER DELETE ON public.bail_signatures
FOR EACH ROW EXECUTE FUNCTION public.reset_annonce_signature_on_delete();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── VÉRIFICATION POST-APPLY ───────────────────────────────────────────────
--
-- Schema check :
--   \d annonces  -- doit inclure notified_depot_retard_at, notified_stagnant_at
--   \d bail_signatures  -- doit inclure integrity_check_failed_at
--   \d etats_des_lieux  -- doit inclure items_contestes, contestation_date, contestation_message
--
-- Trigger check :
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.bail_signatures'::regclass
--      AND NOT tgisinternal;
--   -- doit retourner trg_reset_annonce_signature_on_delete
--
-- Test fonctionnel trigger (sur un bail de test) :
--   -- Pose la signature
--   INSERT INTO bail_signatures(annonce_id, signataire_role, signataire_email, ...) VALUES (...);
--   UPDATE annonces SET bail_signe_locataire_at = now() WHERE id = X;
--   -- Vérifie
--   SELECT bail_signe_locataire_at FROM annonces WHERE id = X;  -- non null
--   -- Supprime la signature
--   DELETE FROM bail_signatures WHERE annonce_id = X AND signataire_role = 'locataire';
--   -- Vérifie : trigger doit avoir reset
--   SELECT bail_signe_locataire_at FROM annonces WHERE id = X;  -- NULL ✓
--
-- Smoke test routes V69 :
--   ✓ /api/cron/depot-retard ne crash pas (notified_depot_retard_at existe)
--   ✓ /api/cron/annonces-stagnantes ne crash pas (notified_stagnant_at existe)
--   ✓ /api/cron/verify-integrity-baux ne crash pas (integrity_check_failed_at existe)
--   ✓ POST /api/edl/contester ne crash pas (items_contestes/contestation_* existent)
