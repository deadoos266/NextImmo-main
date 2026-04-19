-- Migration 014 : Table bail_signatures
-- Signature électronique eIDAS niveau 1 (simple) — valable pour les baux d'habitation
-- en France selon le règlement UE 910/2014 + article 1366 du Code civil.
--
-- Audit trail : email, rôle, IP, user-agent, mention manuscrite, hash du PDF,
-- timestamp. Image de la signature (canvas PNG) stockée en base64.

CREATE TABLE IF NOT EXISTS public.bail_signatures (
  id              bigserial PRIMARY KEY,
  annonce_id      integer NOT NULL REFERENCES public.annonces(id) ON DELETE CASCADE,
  signataire_email text NOT NULL,
  signataire_nom  text NOT NULL,
  signataire_role text NOT NULL CHECK (signataire_role IN ('bailleur', 'locataire', 'garant')),
  signature_png   text NOT NULL,             -- base64 PNG du canvas
  mention         text NOT NULL,             -- "Lu et approuvé, bon pour accord"
  bail_hash       text,                      -- SHA-256 du payload JSON du bail (intégrité)
  ip_address      text,
  user_agent      text,
  signe_at        timestamptz NOT NULL DEFAULT now()
);

-- Une seule signature par (bien, email, rôle) — évite les doublons en cas de double-clic
CREATE UNIQUE INDEX IF NOT EXISTS idx_bail_signatures_unique
  ON public.bail_signatures (annonce_id, signataire_email, signataire_role);

-- Index pour la lookup côté client
CREATE INDEX IF NOT EXISTS idx_bail_signatures_annonce
  ON public.bail_signatures (annonce_id);

-- Colonne bail_signe_at sur annonces : date de signature complète (locataire ET bailleur)
-- Simplifie les queries pour afficher le statut sans JOIN.
ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS bail_signe_locataire_at timestamptz,
  ADD COLUMN IF NOT EXISTS bail_signe_bailleur_at timestamptz;

COMMENT ON TABLE public.bail_signatures IS
  'Signature électronique simple (eIDAS niveau 1). Audit trail pour traçabilité.';
