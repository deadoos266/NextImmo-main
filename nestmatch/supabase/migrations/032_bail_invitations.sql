-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 032 — Versioning de bail_invitations (V23.1)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V23.1)
-- Date: 2026-04-29
-- Status: ALREADY APPLIED IN PROD (table existe). Ce fichier est la version
--   versionnée pour rebuild from scratch / staging — IF NOT EXISTS partout.
--
-- ─── CONTEXTE ──────────────────────────────────────────────────────────────
--
-- Audit V22.1 (docs/AUDIT_FLOW_BAIL.md) a révélé que la table bail_invitations
-- existait en prod mais sans migration versionnée dans le repo. Risque :
-- schéma drift, recovery from-scratch impossible. Cette migration documente
-- exactement le schéma actuel inspecté via Supabase MCP execute_sql.
--
-- Schéma reverse-engineered :
--   - id uuid PK gen_random_uuid()
--   - annonce_id bigint NOT NULL (FK annonces.id)
--   - proprietaire_email text NOT NULL
--   - locataire_email text NOT NULL
--   - token text NOT NULL UNIQUE (64-char hex, anti-bruteforce)
--   - statut text NOT NULL DEFAULT 'pending' (pending | accepted | declined | expired)
--   - loyer_hc integer
--   - charges integer
--   - message_proprio text
--   - expires_at timestamptz NOT NULL (14j default)
--   - responded_at timestamptz (set quand accept/decline)
--   - created_at timestamptz NOT NULL DEFAULT now()
--
-- Indexes existants (vérifiés via pg_indexes) :
--   - bail_invitations_pkey (id)
--   - bail_invitations_token_key (token UNIQUE)
--   - idx_bail_invitations_token (token, redundant avec _key mais lookup)
--   - idx_bail_invitations_locataire (locataire_email, statut)
--   - idx_bail_invitations_proprio (proprietaire_email, statut)
--   - idx_bail_invitations_annonce (annonce_id)

CREATE TABLE IF NOT EXISTS public.bail_invitations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id          bigint NOT NULL,
  proprietaire_email  text NOT NULL,
  locataire_email     text NOT NULL,
  token               text NOT NULL UNIQUE,
  statut              text NOT NULL DEFAULT 'pending'
                        CHECK (statut IN ('pending', 'accepted', 'declined', 'expired')),
  loyer_hc            integer,
  charges             integer,
  message_proprio     text,
  expires_at          timestamptz NOT NULL,
  responded_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ⚠️ FK pas appliquée en prod actuellement — à activer en migration future
-- si on veut garantir l'intégrité référentielle :
-- ALTER TABLE public.bail_invitations
--   ADD CONSTRAINT bail_invitations_annonce_fk
--   FOREIGN KEY (annonce_id) REFERENCES public.annonces(id) ON DELETE CASCADE;

-- Indexes existants en prod (CREATE INDEX IF NOT EXISTS pour idempotence)
CREATE INDEX IF NOT EXISTS idx_bail_invitations_token
  ON public.bail_invitations(token);
CREATE INDEX IF NOT EXISTS idx_bail_invitations_locataire
  ON public.bail_invitations(locataire_email, statut);
CREATE INDEX IF NOT EXISTS idx_bail_invitations_proprio
  ON public.bail_invitations(proprietaire_email, statut);
CREATE INDEX IF NOT EXISTS idx_bail_invitations_annonce
  ON public.bail_invitations(annonce_id);

-- Comments
COMMENT ON TABLE public.bail_invitations IS
  'Invitations bail envoyées au locataire avant signature. Token-based.
   Cycle : pending → accepted (locataire signe) | declined | expired (>14j sans réponse).';
COMMENT ON COLUMN public.bail_invitations.token IS
  '64-char hex unique, lien d''invitation /bail-invitation/[token].';
COMMENT ON COLUMN public.bail_invitations.statut IS
  'pending | accepted | declined | expired. CHECK enforced.';

NOTIFY pgrst, 'reload schema';
