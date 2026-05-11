-- V87.1 — Table email_logs : traçabilité complète des emails Resend.
--
-- Alimentée par 2 sources :
--   1. lib/email/resend.ts (sendEmail) → INSERT row "sent" à chaque envoi
--   2. /api/webhooks/resend → UPDATE quand Resend POST event delivered /
--      bounced / complained / opened / clicked
--
-- Permet de :
--   - Voir le statut final de chaque email (delivered ? bounced ?)
--   - Stats par template / par jour (taux délivrabilité, taux ouverture)
--   - Auto-suppress des emails bounce/complaint (V87.6)
--   - Debug "pourquoi mon locataire n'a pas reçu l'email"

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_logs (
  id bigserial PRIMARY KEY,
  resend_id text UNIQUE,        -- ID Resend (re_xxx), null si envoi raté côté SDK
  to_email text NOT NULL,
  from_email text,
  subject text,
  template_name text,           -- ex: 'bail_invitation', 'candidature_acceptee'
  tags jsonb,                   -- tags Resend pour filtrage
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- API call en cours
    'sent',         -- API Resend a retourné un id, en route
    'delivered',    -- destinataire serveur a accepté
    'bounced',      -- adresse invalide, mailbox full, etc.
    'complained',   -- marqué spam par destinataire
    'opened',       -- destinataire a ouvert
    'clicked',      -- destinataire a cliqué un lien
    'failed'        -- erreur côté SDK Resend (ex: api key invalide)
  )),
  sent_at timestamptz DEFAULT now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  bounce_type text,             -- 'hard', 'soft', 'undetermined'
  error_message text,
  metadata jsonb,               -- payload webhook raw + autres
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_to_email ON public.email_logs(to_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_template ON public.email_logs(template_name);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON public.email_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_resend_id ON public.email_logs(resend_id);

-- Trigger updated_at auto
CREATE OR REPLACE FUNCTION public.set_updated_at_email_logs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_email_logs_updated_at ON public.email_logs;
CREATE TRIGGER trg_email_logs_updated_at
  BEFORE UPDATE ON public.email_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_email_logs();

-- Table suppress list : emails bounce/complaint qu'on ne doit plus contacter
CREATE TABLE IF NOT EXISTS public.email_suppress_list (
  email text PRIMARY KEY,
  reason text NOT NULL CHECK (reason IN ('hard_bounce', 'soft_bounce', 'complaint', 'manual')),
  reason_detail text,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by text,                -- 'webhook' ou email admin
  removed_at timestamptz,       -- null si actif, set si réactivé
  removed_by text
);

CREATE INDEX IF NOT EXISTS idx_email_suppress_active ON public.email_suppress_list(email) WHERE removed_at IS NULL;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.email_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.email_suppress_list FROM anon;
REVOKE SELECT ON TABLE public.email_logs FROM anon;
REVOKE SELECT ON TABLE public.email_suppress_list FROM anon;
-- service_role bypass ces revokes (utilisé côté serveur)

NOTIFY pgrst, 'reload schema';

COMMIT;
