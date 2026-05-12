-- V97.24 — Système de validation des releases par Paul (admin)
--
-- Paul demande : "à chaque commit, tu pourrais pas faire ça : me montrer ça
-- et que je dois cocher pour valider ou non, et si non problème avec photo
-- et screen". Implémentation en table DB pour persistance multi-device.
--
-- À chaque commit important, le système crée une row avec :
--   - les claims du commit (commit_title, commit_body extraits du message git)
--   - une checklist (jsonb) de checks à valider manuellement par Paul
--   - status global : pending / in_progress / validated / blocked
--
-- Chaque check individuel dans le jsonb a :
--   { id, label, status: "pending"|"ok"|"blocked", note?, screenshot_path? }
--
-- Quand un check est bloqué : description + screenshot stocké dans le bucket
-- privé `bug-screenshots` (réutilise V97.10), accessible via signed URL.

BEGIN;

CREATE TABLE IF NOT EXISTS public.release_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_sha text NOT NULL UNIQUE,
  commit_short text,
  commit_title text NOT NULL,
  commit_body text,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'validated', 'blocked')),
  -- Description globale du blocage (si status='blocked'). Pour blocages
  -- par check, la note est dans checks[N].note.
  blocker_description text,
  blocker_screenshot_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  validated_by text
);

CREATE INDEX IF NOT EXISTS idx_release_validations_status_created
  ON public.release_validations(status, created_at DESC);

-- Trigger updated_at auto-bump
CREATE OR REPLACE FUNCTION public.set_updated_at_release_validations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_validations_updated_at ON public.release_validations;
CREATE TRIGGER trg_release_validations_updated_at
  BEFORE UPDATE ON public.release_validations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_release_validations();

-- RLS : table interne admin uniquement. Accès via supabaseAdmin server-side.
REVOKE ALL ON TABLE public.release_validations FROM anon;
REVOKE ALL ON TABLE public.release_validations FROM authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
