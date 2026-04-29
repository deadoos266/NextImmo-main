-- Migration 044 — V34.7 (Paul 2026-04-29)
-- Audit produit V31 R3.1 : avenant (modification post-signature) avec
-- re-signature partielle des 2 parties.
--
-- Version minimale V34.7 : table + statut + historique. Le PDF
-- et la re-signature sont à shipper en V35 (cf V34.7 commit message).
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.bail_avenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id integer NOT NULL REFERENCES public.annonces(id) ON DELETE CASCADE,
  numero integer NOT NULL,  -- N° d'avenant pour ce bail (1, 2, 3...)
  type text NOT NULL,  -- "ajout_colocataire" | "retrait_colocataire" | "modif_loyer" | "modif_charges" | "ajout_garant" | "retrait_garant" | "modif_clause" | "autre"
  titre text NOT NULL,  -- ex "Ajout d'un colocataire : Marc Dupont"
  description text,  -- texte libre détail de la modification
  ancien_payload jsonb,  -- snapshot du bail AVANT
  nouveau_payload jsonb,  -- snapshot du bail APRÈS (proposé)
  pdf_url text,  -- V35 : URL du PDF avenant signé
  statut text NOT NULL DEFAULT 'propose',  -- "propose" | "signe_locataire" | "signe_proprio" | "actif" | "annule"
  propose_par_email text NOT NULL,
  signe_locataire_at timestamptz,
  signe_bailleur_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT bail_avenants_numero_positive CHECK (numero > 0),
  CONSTRAINT bail_avenants_statut_valide CHECK (statut IN ('propose', 'signe_locataire', 'signe_proprio', 'actif', 'annule')),
  CONSTRAINT bail_avenants_unique_numero UNIQUE (annonce_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_bail_avenants_annonce ON public.bail_avenants(annonce_id, statut);
CREATE INDEX IF NOT EXISTS idx_bail_avenants_propose_par ON public.bail_avenants(propose_par_email);

COMMENT ON TABLE public.bail_avenants IS
  'V34.7 — Modifications post-signature du bail (avenants). 1 row = 1 modification proposée. '
  'Statut "actif" = signé par les 2 parties.';

-- RLS désactivée côté table : les routes /api/bail/avenant/* gèrent l''auth via NextAuth + supabaseAdmin
-- (cohérent avec bail_signatures, bail_invitations qui n''ont pas RLS active non plus côté V32+).
ALTER TABLE public.bail_avenants ENABLE ROW LEVEL SECURITY;

-- Policy READ : proprio OU locataire de l''annonce concernée.
DROP POLICY IF EXISTS bail_avenants_read_own ON public.bail_avenants;
CREATE POLICY bail_avenants_read_own ON public.bail_avenants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.annonces a
      WHERE a.id = bail_avenants.annonce_id
        AND (
          a.proprietaire_email = auth.jwt() ->> 'email'
          OR a.locataire_email = auth.jwt() ->> 'email'
        )
    )
  );

-- INSERT/UPDATE/DELETE : seul service_role (= /api/* avec supabaseAdmin).
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bail_avenants FROM anon, authenticated;
