-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 083 — V97.39 P3-7 Phase 1 — Import jobs (async polling pattern)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Claude (V97.39)
-- Date: 2026-05-17
-- Status: READY TO APPLY
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- Table `import_jobs` : tracking des imports asynchrones via worker
-- Zendriver self-host (bypass DataDome Leboncoin/SeLoger/Logic-immo).
--
-- Flow :
--   1. POST /api/proprio/annonce/import URL DataDome → crée row pending
--   2. Worker reçoit + scrape async → POST callback → row done/failed
--   3. Client UI poll GET /api/proprio/annonce/import/status?id=X (2s, 30s timeout)
--   4. Row affiche data extracted, client pré-remplit wizard
--
-- RLS : user_email = session uniquement. Service role bypass pour le callback worker.
--
-- Rétention : cron de purge >7 jours (les jobs sont éphémères, pas de valeur historique).

BEGIN;

CREATE TABLE IF NOT EXISTS public.import_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      text NOT NULL,
  source_url      text NOT NULL,
  source          text,                                    -- nom parser (leboncoin, seloger, etc.)
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  data            jsonb,                                   -- ImportedAnnonce extracted
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

-- Trigger pour updated_at auto-bump
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

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- Les routes API utilisent service_role qui bypass RLS naturellement.
-- Si jamais on expose à l'anon key plus tard, ajouter une policy :
-- CREATE POLICY "user sees own jobs" ON public.import_jobs
--   FOR SELECT USING (user_email = (auth.jwt() ->> 'email'));

COMMIT;

-- ─── ROLLBACK ──────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_import_jobs_updated_at ON public.import_jobs;
--   DROP FUNCTION IF EXISTS public.import_jobs_set_updated_at();
--   DROP TABLE IF EXISTS public.import_jobs;
-- COMMIT;
