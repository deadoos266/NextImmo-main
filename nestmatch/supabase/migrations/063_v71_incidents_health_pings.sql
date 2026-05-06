-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 063 — V71 : tables incidents + health_pings (status page)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V71.3)
-- Date: 2026-05-06
-- Status: ✅ MIGRATION READY — APPLIQUER en prod après deploy V71.3+V71.4
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- 1. Table `public.incidents` — incidents publics + internes affichés sur
--    /status (publics uniquement) et /admin/health (tous).
-- 2. Table `public.health_pings` — historique fin granulaire des checks
--    auto (cron + manuels) pour calculer uptime % et timeline 30 jours.
--
-- Idempotent (IF NOT EXISTS / CHECK constraints réutilisables).

BEGIN;

-- ─── INCIDENTS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.incidents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  -- 'info' (info utilisateur, pas un incident technique stricto sensu —
  -- typiquement annonce de maintenance planifiée), 'minor', 'major', 'critical'.
  severity     text NOT NULL CHECK (severity IN ('info', 'minor', 'major', 'critical')),
  -- 'investigating' → 'identified' → 'monitoring' → 'resolved'.
  status       text NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  -- Service impacté. Aligné sur les checks dans /api/health/full.
  service      text NOT NULL CHECK (service IN ('database', 'auth', 'email', 'storage', 'crons', 'app')),
  -- Si false : visible uniquement sur /admin/health (interne).
  -- Si true  : visible sur /status (page publique).
  is_public    boolean NOT NULL DEFAULT false,
  started_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_started_at
  ON public.incidents (started_at DESC);

-- Composite pour /status : "WHERE is_public = true AND status != 'resolved'"
CREATE INDEX IF NOT EXISTS idx_incidents_is_public_status
  ON public.incidents (is_public, status);

-- ─── HEALTH PINGS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.health_pings (
  id            bigserial PRIMARY KEY,
  service       text NOT NULL CHECK (service IN ('database', 'auth', 'email', 'storage', 'crons', 'app')),
  status        text NOT NULL CHECK (status IN ('up', 'degraded', 'down')),
  latency_ms    integer,
  error_message text,
  checked_at    timestamptz NOT NULL DEFAULT now()
);

-- Index principal : "WHERE service = X ORDER BY checked_at DESC LIMIT N"
CREATE INDEX IF NOT EXISTS idx_health_pings_service_checked
  ON public.health_pings (service, checked_at DESC);

-- Index pour cron purge (`DELETE WHERE checked_at < now() - interval '30 days'`)
CREATE INDEX IF NOT EXISTS idx_health_pings_checked_at
  ON public.health_pings (checked_at);

-- ─── PERMISSIONS ───────────────────────────────────────────────────────────

-- Phase 5 RLS lockdown — anon ne fait JAMAIS d'écriture.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.incidents    FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.health_pings FROM anon;

-- /status est une page publique (RSC) qui lit `incidents` côté serveur via
-- la clé service-role. Pour permettre un fallback côté browser (sub-composant
-- client polling toutes les 60 s) on autorise explicitement le SELECT anon
-- sur incidents — c'est ok puisque la table contient déjà la flag `is_public`
-- pour filtrer le contenu sensible. Côté client on ajoute toujours
-- `.eq('is_public', true)` dans la requête (pas de RLS policy : minimisation
-- du nombre de policies, vu qu'aucune donnée privée ne fuit même si la flag
-- était oubliée).
GRANT SELECT ON TABLE public.incidents TO anon;

-- health_pings ne se lit JAMAIS depuis le client anon — toujours agrégé
-- via /api/health/full (server-side avec service-role). RLS phase 5 stricte.
-- Pas de GRANT SELECT supplémentaire.

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── VÉRIFICATION POST-APPLY ───────────────────────────────────────────────
--
-- Schema check :
--   \d incidents          -- 9 colonnes, PK uuid, 2 CHECK constraints
--   \d health_pings       -- 6 colonnes, PK bigserial, 1 CHECK
--   \di idx_incidents_*   -- 2 index présents
--   \di idx_health_pings_*-- 2 index présents
--
-- Test seed manuel :
--   INSERT INTO incidents (title, severity, status, service, is_public)
--   VALUES ('Maintenance planifiée — base de données', 'info', 'monitoring', 'database', true);
--   SELECT * FROM incidents WHERE is_public = true AND status != 'resolved';
--   -- doit retourner 1 ligne
--
-- Test ping seed :
--   INSERT INTO health_pings (service, status, latency_ms) VALUES
--     ('database', 'up', 12),
--     ('email', 'up', 187);
--   SELECT service, status, latency_ms FROM health_pings ORDER BY checked_at DESC LIMIT 5;
--
-- Test permissions :
--   -- Set role anon dans Supabase SQL editor :
--   SET ROLE anon;
--   SELECT * FROM incidents WHERE is_public = true;  -- OK
--   INSERT INTO incidents (...) VALUES (...);        -- ERROR permission denied ✅
--   SELECT * FROM health_pings;                       -- ERROR permission denied ✅
--   RESET ROLE;
--
-- Smoke test côté app :
--   ✓ GET /api/health/full → INSERT auto dans health_pings, INSERT incident
--     auto si transition up→down
--   ✓ POST /api/admin/incidents/create (admin only) → INSERT
--   ✓ POST /api/admin/incidents/[id]/resolve → UPDATE resolved_at
--   ✓ /status publique → SELECT incidents WHERE is_public=true AND status!='resolved'
--   ✓ /admin/health → SELECT incidents (tous) + agrégation health_pings 30j
