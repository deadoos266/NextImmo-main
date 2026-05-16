-- ═══════════════════════════════════════════════════════════════════════════
-- APPLY NOW — Migrations 083 + 084 — V97.39 P3-7 Phase 1
-- ═══════════════════════════════════════════════════════════════════════════
--
-- À appliquer AVANT de merger le code Phase 1 (worker Zendriver) en prod.
--
-- Si non appliqué :
--   - GET /api/admin/imports : la nouvelle requête sur `fetcher_used`
--     retourne une erreur PostgREST 42703, l'agrégation tombe à vide.
--     Pas de crash mais la card "stats par voie" reste vide.
--   - POST /api/proprio/annonce/import : l'INSERT loggue `fetcher_used`
--     mais la colonne n'existe pas → throw rattrapé en console.warn,
--     log perdu. Pas de crash UX, monitoring dégradé.
--
-- Usage : copier-coller ce fichier ENTIER dans Supabase Dashboard → SQL Editor
-- → Run. Tout est idempotent (IF NOT EXISTS partout).
--
-- Migrations sources :
--   - nestmatch/supabase/migrations/083_p3_7_import_jobs.sql
--   - nestmatch/supabase/migrations/084_p3_7_import_logs_fetcher.sql

BEGIN;

-- ─── Migration 083 — table import_jobs ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.import_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      text NOT NULL,
  source_url      text NOT NULL,
  source          text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  data            jsonb,
  fields_extracted integer,
  fields_total    integer,
  duration_ms     integer,
  error_code      text,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_user_created
  ON public.import_jobs (user_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status_created
  ON public.import_jobs (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.import_jobs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_import_jobs_updated_at ON public.import_jobs;
CREATE TRIGGER trg_import_jobs_updated_at
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.import_jobs_set_updated_at();

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
-- Pas de policy : seul service_role peut écrire (bypass RLS naturel).
-- À ajouter une policy SELECT user_email = session si on expose à l'anon plus tard.


-- ─── Migration 084 — import_logs.fetcher_used ──────────────────────────────

ALTER TABLE public.import_logs
  ADD COLUMN IF NOT EXISTS fetcher_used text;

CREATE INDEX IF NOT EXISTS idx_import_logs_fetcher_status
  ON public.import_logs (fetcher_used, status, created_at DESC);


COMMIT;

-- ─── VÉRIFICATIONS POST-APPLY ──────────────────────────────────────────────
--
-- Lance ces 3 SELECT après le COMMIT pour confirmer l'application :
--
-- 1. La table import_jobs doit avoir 12 colonnes :
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'import_jobs' AND table_schema = 'public'
--    ORDER BY ordinal_position;
--
-- 2. La colonne fetcher_used doit exister sur import_logs :
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'import_logs' AND column_name = 'fetcher_used';
--
-- 3. Les indexes doivent exister :
--    SELECT indexname FROM pg_indexes
--    WHERE schemaname = 'public'
--      AND tablename IN ('import_jobs', 'import_logs')
--      AND indexname LIKE 'idx_import%';
