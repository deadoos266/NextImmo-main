-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 088 — Phase D — Webhooks pour agences
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Claude (V97.39.34)
-- Date: 2026-05-18
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- Webhooks HTTPS pour permettre aux agences de recevoir des events
-- KeyMatch en temps réel dans leur CRM/logiciel métier sans devoir
-- poller l'API toutes les 5 minutes.
--
-- Tables :
--   - `agence_webhooks` : config webhook par agence (URL, secret HMAC,
--      events souscrits, actif/désactivé).
--   - `webhook_deliveries` : queue de delivery avec retry. Worker async
--      pop les entries pending et POST. Backoff exponential 1m/5m/30m.
--
-- Events supportés (MVP) :
--   - `candidature.created`  : une visite est proposée (= candidature)
--   - `visite.confirmee`     : visite confirmée par l'autre partie
--   - `bail.signed`          : bail signé par les deux parties
--   - `message.received`     : message reçu sur une annonce de l'agence
--
-- Plus tard :
--   - `annonce.created` (via API ou import)
--   - `annonce.updated`
--   - `candidature.accepted`, `candidature.refused`
--
-- Sécurité :
--   - HMAC SHA256 du body avec secret partagé (config UI)
--   - Header `X-KeyMatch-Signature: sha256=<hex>` envoyé avec chaque POST
--   - L'agence DOIT vérifier la signature côté serveur (doc tech)
--   - Pas de retry si signature invalide (l'agence a changé son secret)
--
-- Retry policy :
--   - HTTP 2xx → success, delivery marquée done
--   - HTTP 4xx (sauf 408/429) → marquée failed permanent (ne re-trigge pas)
--   - HTTP 5xx, timeout, network err → retry après 1m, 5m, 30m (3 tentatives)
--   - Après 3 échecs → marquée failed, alerte dans /agence/dashboard

BEGIN;

-- ─── 1. Table agence_webhooks ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agence_webhooks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agence_id     uuid NOT NULL REFERENCES public.agences(id) ON DELETE CASCADE,

  -- Configuration
  url           text NOT NULL CHECK (url ~ '^https://'),
  secret        text NOT NULL,                              -- secret HMAC en clair (pas hashé, on s'en sert pour signer)
  events        text[] NOT NULL DEFAULT ARRAY[]::text[],    -- ex: ['candidature.created', 'visite.confirmee']
  active        boolean NOT NULL DEFAULT true,
  label         text,                                       -- ex: "n8n prod" ou "Apimo CRM"

  -- Audit
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Stats
  total_deliveries  integer NOT NULL DEFAULT 0,
  total_failures    integer NOT NULL DEFAULT 0,
  last_delivered_at timestamptz,
  last_failed_at    timestamptz,
  last_status       integer
);

CREATE INDEX IF NOT EXISTS idx_agence_webhooks_agence_active
  ON public.agence_webhooks (agence_id)
  WHERE active = true;

CREATE OR REPLACE FUNCTION public.agence_webhooks_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_webhooks_updated_at ON public.agence_webhooks;
CREATE TRIGGER trg_webhooks_updated_at
  BEFORE UPDATE ON public.agence_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION public.agence_webhooks_set_updated_at();


-- ─── 2. Table webhook_deliveries (queue async) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id           bigserial PRIMARY KEY,
  webhook_id   uuid NOT NULL REFERENCES public.agence_webhooks(id) ON DELETE CASCADE,
  agence_id    uuid NOT NULL REFERENCES public.agences(id) ON DELETE CASCADE,
  event        text NOT NULL,                               -- ex: "candidature.created"
  payload      jsonb NOT NULL,                              -- body envoyé à l'URL agence
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'success', 'failed', 'abandoned')),
  attempt      integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_status_code integer,
  last_response_body text,                                   -- tronqué à 2000 chars
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
  ON public.webhook_deliveries (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook
  ON public.webhook_deliveries (webhook_id, created_at DESC);


-- ─── 3. Sanity check ───────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM information_schema.tables
          WHERE table_name = 'agence_webhooks' AND table_schema = 'public') = 1;
  ASSERT (SELECT count(*) FROM information_schema.tables
          WHERE table_name = 'webhook_deliveries' AND table_schema = 'public') = 1;
END $$;

COMMIT;
