-- Migration 016 : Table edl_signatures
-- Signature électronique eIDAS niveau 1 pour les états des lieux.
-- Même pattern que bail_signatures (migration 014) : audit trail complet.

CREATE TABLE IF NOT EXISTS public.edl_signatures (
  id              bigserial PRIMARY KEY,
  edl_id          uuid NOT NULL REFERENCES public.etats_des_lieux(id) ON DELETE CASCADE,
  signataire_email text NOT NULL,
  signataire_nom  text NOT NULL,
  signataire_role text NOT NULL CHECK (signataire_role IN ('bailleur', 'locataire')),
  signature_png   text NOT NULL,             -- base64 PNG du canvas
  mention         text NOT NULL,             -- "Lu et approuvé, bon pour accord"
  ip_address      text,
  user_agent      text,
  signe_at        timestamptz NOT NULL DEFAULT now()
);

-- Une seule signature par (EDL, email, rôle) — évite doublons en cas de double-clic
CREATE UNIQUE INDEX IF NOT EXISTS idx_edl_signatures_unique
  ON public.edl_signatures (edl_id, signataire_email, signataire_role);

CREATE INDEX IF NOT EXISTS idx_edl_signatures_edl
  ON public.edl_signatures (edl_id);

-- Timestamp des signatures sur etats_des_lieux (raccourci sans JOIN)
ALTER TABLE public.etats_des_lieux
  ADD COLUMN IF NOT EXISTS signe_locataire_at timestamptz,
  ADD COLUMN IF NOT EXISTS signe_bailleur_at timestamptz;

COMMENT ON TABLE public.edl_signatures IS
  'Signature électronique EDL (eIDAS niveau 1). Audit trail.';

NOTIFY pgrst, 'reload schema';
