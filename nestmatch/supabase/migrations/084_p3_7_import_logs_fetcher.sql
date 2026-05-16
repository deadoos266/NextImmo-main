-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 084 — V97.39 P3-7 Phase 1 — import_logs.fetcher_used
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Claude (V97.39)
-- Date: 2026-05-17
-- Status: READY TO APPLY
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- Ajoute la colonne `fetcher_used` à `import_logs` pour distinguer :
--   - 'wreq-js'        : fetcher Vercel direct avec TLS impersonation (PAP, agences)
--   - 'zendriver-worker': worker self-host VPS (DataDome bypass — LBC/SeLoger/Logic-immo)
--   - 'native-fetch'   : fallback fetch() Node natif (tests, env sans wreq)
--
-- Permet à /admin/imports de visualiser quelle voie d'extraction est utilisée
-- et son taux de succès. Critique pour monitorer la santé du worker.

BEGIN;

ALTER TABLE public.import_logs
  ADD COLUMN IF NOT EXISTS fetcher_used text;

CREATE INDEX IF NOT EXISTS idx_import_logs_fetcher_status
  ON public.import_logs (fetcher_used, status, created_at DESC);

COMMIT;

-- ─── ROLLBACK ──────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP INDEX IF EXISTS public.idx_import_logs_fetcher_status;
--   ALTER TABLE public.import_logs DROP COLUMN IF EXISTS fetcher_used;
-- COMMIT;
