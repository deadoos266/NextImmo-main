-- V84.2 — Tables cron_logs + user_bug_reports
--
-- cron_logs : historique d'exécution des crons (success/failure/timeout)
--   alimenté par lib/cron/withCronLogging.ts (V84.10) qui wrappe les
--   handlers de crons existants.
--
-- user_bug_reports : signalements bug par les users via widget bottom-right
--   sur le site (V84.8). Admin gère via /admin/bugs.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cron_logs (
  id bigserial PRIMARY KEY,
  cron_path text NOT NULL,        -- '/api/cron/loyers-retard'
  cron_name text NOT NULL,        -- 'loyers-retard'
  schedule text,                  -- '0 8 * * *' (info)
  status text NOT NULL CHECK (status IN ('success', 'failure', 'timeout', 'started')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  error_message text,
  result_summary jsonb,           -- { rows_processed: 12, emails_sent: 5, ... }
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_logs_cron_name_started ON public.cron_logs(cron_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_logs_status ON public.cron_logs(status);

CREATE TABLE IF NOT EXISTS public.user_bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text,
  user_role text,
  page_url text NOT NULL,
  user_agent text,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'minor' CHECK (severity IN ('critical', 'major', 'minor', 'cosmetic')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'fixed', 'wontfix', 'duplicate')),
  screenshot_url text,
  console_log jsonb,
  network_log jsonb,
  notes text,
  fixed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_status_created ON public.user_bug_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_severity ON public.user_bug_reports(severity);

-- Trigger pour updated_at sur user_bug_reports
CREATE OR REPLACE FUNCTION public.set_updated_at_user_bug_reports()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_bug_reports_updated_at ON public.user_bug_reports;
CREATE TRIGGER trg_user_bug_reports_updated_at
  BEFORE UPDATE ON public.user_bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_user_bug_reports();

REVOKE INSERT, UPDATE, DELETE ON TABLE public.cron_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_bug_reports FROM anon;
-- users authenticated peuvent reporter (INSERT only)
GRANT INSERT ON TABLE public.user_bug_reports TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
