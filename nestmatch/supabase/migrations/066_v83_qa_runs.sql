-- V83.1 — Table qa_runs pour le QA Bot autonome.
--
-- Stocke les résultats des tests Playwright headless lancés via cron
-- ou bouton admin. Chaque run = 1 scénario YAML exécuté.
-- Lu par /admin/qa (RSC + client). Écrit par /api/qa/run et
-- /api/cron/qa-daily-run.
--
-- Sécurité :
--   - REVOKE INSERT/UPDATE/DELETE anon : aucune écriture côté client direct
--   - SELECT anon non explicitement revoke pour permettre RSC read si
--     besoin, mais les usages passent par /api/qa/* qui filtre côté serveur
--   - Les écritures back-end utilisent supabaseAdmin (service_role)

BEGIN;

CREATE TABLE IF NOT EXISTS public.qa_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_name text NOT NULL,
  scenario_file text NOT NULL,
  status text NOT NULL CHECK (status IN ('pass', 'fail', 'partial', 'running')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  steps_total integer NOT NULL DEFAULT 0,
  steps_passed integer NOT NULL DEFAULT 0,
  steps_failed integer NOT NULL DEFAULT 0,
  screenshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  network_log jsonb,
  console_log jsonb,
  trigger text NOT NULL CHECK (trigger IN ('manual', 'cron', 'api')),
  triggered_by text,  -- email admin ou 'cron'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_runs_started_at ON public.qa_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_runs_status ON public.qa_runs(status);
CREATE INDEX IF NOT EXISTS idx_qa_runs_scenario ON public.qa_runs(scenario_name);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.qa_runs FROM anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
