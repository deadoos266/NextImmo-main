-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 082 — V97.36 P3-7 — Import logs (multi-source URL annonce)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Claude (V97.36)
-- Date: 2026-05-13
-- Status: READY TO APPLY
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- 1. Table `import_logs` : log chaque tentative d'import URL annonce
--    (Leboncoin, SeLoger, PAP, Bien'ici, Logic-immo, générique).
--    Permet de monitorer les taux de succès par source → si un parser
--    fail >50% sur 7 jours, alerte admin pour patcher la regex.
--
-- 2. Aucune RLS : table interne (admin only). Pas de lecture côté anon.
--
-- 3. La rétention est sans limite pour l'instant (volumétrie attendue :
--    <100 imports / jour). Si ça explose, ajouter un cron de purge >90j.

BEGIN;

CREATE TABLE IF NOT EXISTS public.import_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      text,
  source          text,
  source_url      text,
  status          text NOT NULL CHECK (status IN ('success', 'fail', 'partial')),
  fields_extracted integer,
  fields_total    integer,
  duration_ms     integer,
  error_code      text,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_logs_created
  ON public.import_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_logs_source_status
  ON public.import_logs (source, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_logs_user
  ON public.import_logs (user_email, created_at DESC);

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
-- Aucune policy = pas d'accès anon. Le service_role bypass RLS pour les
-- routes API admin. C'est volontaire (table interne).

COMMIT;

-- ─── ROLLBACK ──────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP TABLE IF EXISTS public.import_logs;
-- COMMIT;
