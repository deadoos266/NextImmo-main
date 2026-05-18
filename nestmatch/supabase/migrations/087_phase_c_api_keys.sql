-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 087 — Phase C — API REST publique pour agences
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Claude (V97.39.34)
-- Date: 2026-05-18
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- API keys management pour permettre aux agences de pousser leurs annonces
-- via HTTP REST depuis leur logiciel métier (Apimo, Hektor, etc.) ou un
-- middleware (Zapier, n8n, script custom).
--
-- Tables :
--   - `agence_api_keys` : clés générées par les agences (admin+ uniquement).
--      Clé en clair JAMAIS stockée — uniquement le hash bcrypt + un préfixe
--      visible (km_live_xxxx...) pour identification.
--   - `agence_api_usage` : log par appel (timestamp, endpoint, status, IP).
--      Permet de monitor l'usage et débug côté admin / agence.
--
-- Format de la clé : `km_live_<32 chars hex>` (style Stripe).
--   - `km_live_` : préfixe identifiable
--   - 32 hex chars = 128 bits entropie (cf openssl rand -hex 16)
--
-- Sécurité :
--   - Hash bcrypt cost 10 (cohérent avec password_hash users)
--   - Affichée 1× à la création, puis irrécupérable (juste révocable)
--   - Audit trail : last_used_at + chaque appel dans agence_api_usage
--
-- Rate limit :
--   - 100 req/min par clé (sliding window via Upstash Redis existant)
--   - Géré côté code, pas DB

BEGIN;

-- ─── 1. Table agence_api_keys ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agence_api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agence_id     uuid NOT NULL REFERENCES public.agences(id) ON DELETE CASCADE,

  -- Métadonnées de la clé
  label         text NOT NULL,                              -- ex: "Apimo prod"
  key_prefix    text NOT NULL,                              -- ex: "km_live_a1b2c3d4" (8 chars visibles)
  key_hash      text NOT NULL,                              -- bcrypt hash de la clé complète

  -- Scopes (permissions accordées)
  scopes        text[] NOT NULL DEFAULT ARRAY[
                  'annonces:read',
                  'annonces:write',
                  'candidatures:read'
                ]::text[],

  -- Audit
  created_by    text NOT NULL,                              -- email du membre qui a créé
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  last_used_ip  text,
  revoked_at    timestamptz,
  revoked_by    text
);

CREATE INDEX IF NOT EXISTS idx_agence_api_keys_agence
  ON public.agence_api_keys (agence_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agence_api_keys_prefix
  ON public.agence_api_keys (key_prefix)
  WHERE revoked_at IS NULL;


-- ─── 2. Table agence_api_usage ─────────────────────────────────────────────
--
-- Log de chaque appel API. Volumétrie estimée : 10k req/jour pour 50 agences.
-- → ~3M rows/an. Purge automatique des entries > 90 jours via cron.

CREATE TABLE IF NOT EXISTS public.agence_api_usage (
  id           bigserial PRIMARY KEY,
  api_key_id   uuid NOT NULL REFERENCES public.agence_api_keys(id) ON DELETE CASCADE,
  agence_id    uuid NOT NULL REFERENCES public.agences(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,                               -- ex: "POST /v1/agences/:id/annonces"
  status_code  smallint NOT NULL,
  ip           text,
  user_agent   text,
  duration_ms  integer,
  error        text,                                        -- message d'erreur si status >= 400
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agence_api_usage_key_created
  ON public.agence_api_usage (api_key_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agence_api_usage_agence_created
  ON public.agence_api_usage (agence_id, created_at DESC);


-- ─── 3. Ajout colonne external_ref sur annonces ────────────────────────────
--
-- Permet à une agence de fournir un identifiant externe (référence Apimo,
-- Hektor, etc.) pour UPSERT idempotent via l'API ou l'import bulk.
-- Unique par agence (deux agences différentes peuvent avoir REF-001 chacune).

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS external_ref text;

COMMENT ON COLUMN public.annonces.external_ref IS
  'Référence externe agence (Apimo ID, Hektor ID, etc.) pour UPSERT API.';

-- Unique partial : seulement non-null
DROP INDEX IF EXISTS uniq_annonces_agence_external_ref;
CREATE UNIQUE INDEX uniq_annonces_agence_external_ref
  ON public.annonces (agence_id, external_ref)
  WHERE agence_id IS NOT NULL AND external_ref IS NOT NULL;


-- ─── 4. Sanity check ──────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM information_schema.tables
          WHERE table_name = 'agence_api_keys' AND table_schema = 'public') = 1;
  ASSERT (SELECT count(*) FROM information_schema.tables
          WHERE table_name = 'agence_api_usage' AND table_schema = 'public') = 1;
  ASSERT (SELECT count(*) FROM information_schema.columns
          WHERE table_name = 'annonces' AND column_name = 'external_ref') = 1;
END $$;

COMMIT;
