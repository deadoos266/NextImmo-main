-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 054 — V57 Flow post-bail (fin de location)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V57)
-- Date: 2026-04-30
-- Status: READY TO APPLY
--
-- ─── PRÉREQUIS DÉJÀ EN PLACE ───────────────────────────────────────────────
--
-- V21 (mig 021) :
--   annonces.statut CHECK accepte 'loue_termine'
--   annonces.bail_termine_at + locataire_email_at_end
--   profils.anciens_logements jsonb
-- V32.5 + V42 :
--   annonces.preavis_donne_par + preavis_fin_calculee
--   annonces.bail_signe_locataire_at + bail_signe_bailleur_at
--
-- ─── SCOPE V57 ─────────────────────────────────────────────────────────────
--
-- 1. Table `historique_baux` qui archive UN bail clos avec tous les détails
--    (durée, loyer total, dépôt restitué, dégradations, EDL, bail PDF URL).
--    Permet la page /proprietaire/baux/historique + /mon-logement/historique
--    + analytics pour le proprio (revenu cumulé par bien).
--
-- 2. Colonnes annonces.depot_* pour tracker la restitution du dépôt de
--    garantie (légal ALUR : 1 mois si pas de retenue, 2 mois sinon).
--
-- 3. profils.iban + profils.iban_titulaire pour la restitution dépôt
--    (renseigné par le locataire au moment de la fin de bail).

BEGIN;

-- ─── 1. Table historique_baux ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.historique_baux (
  id                          bigserial PRIMARY KEY,
  annonce_id                  integer NOT NULL,
  proprietaire_email          text NOT NULL,
  locataire_email             text NOT NULL,
  -- Dates clés
  date_debut_bail             date,
  date_fin_bail               date,
  bail_termine_at             timestamptz NOT NULL DEFAULT now(),
  -- Snapshot infos bien (au moment de la fin)
  bien_titre                  text,
  bien_ville                  text,
  bien_adresse                text,
  -- Snapshot loyer (peut différer de annonces.prix après relocation)
  loyer_hc                    numeric,
  charges                     numeric,
  caution                     numeric,
  -- Restitution dépôt
  depot_restitue_at           timestamptz,
  depot_montant_restitue      numeric,
  depot_montant_retenu        numeric DEFAULT 0,
  depot_motifs_retenue        jsonb DEFAULT '[]'::jsonb,
  -- Total revenus du bail
  total_loyers_percus         numeric,
  -- PDF bail signé (URL stable même après relocation)
  bail_pdf_url                text,
  edl_entree_id               uuid,
  edl_sortie_id               uuid,
  -- Cause de fin
  fin_motif                   text,  -- preavis_locataire / preavis_bailleur / fin_terme / accord_amiable
  fin_motif_detail            text,
  -- Audit
  created_at                  timestamptz NOT NULL DEFAULT now(),
  -- Index utiles
  CONSTRAINT historique_baux_annonce_fk
    FOREIGN KEY (annonce_id) REFERENCES public.annonces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_historique_baux_proprio
  ON public.historique_baux (proprietaire_email, bail_termine_at DESC);
CREATE INDEX IF NOT EXISTS idx_historique_baux_locataire
  ON public.historique_baux (locataire_email, bail_termine_at DESC);
CREATE INDEX IF NOT EXISTS idx_historique_baux_annonce
  ON public.historique_baux (annonce_id, bail_termine_at DESC);

COMMENT ON TABLE public.historique_baux IS
  'V57 — archive des baux clos. 1 row par bail terminé (relocations multiples sur '
  'la même annonce → multiples rows). Conservation 3 ans min (ALUR + RGPD).';

-- ─── 2. Colonnes restitution dépôt sur annonces ───────────────────────────

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS depot_restitue_at timestamptz,
  ADD COLUMN IF NOT EXISTS depot_montant_retenu numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depot_motifs_retenue jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.annonces.depot_restitue_at IS
  'V57 — timestamp restitution du dépôt de garantie au locataire. NULL = pas encore restitué.';
COMMENT ON COLUMN public.annonces.depot_montant_retenu IS
  'V57 — somme retenue sur le dépôt pour dégradations imputables. 0 = restitution intégrale.';
COMMENT ON COLUMN public.annonces.depot_motifs_retenue IS
  'V57 — JSON array [{ libelle, montant, type }] détaillant chaque retenue. Source pour PDF justificatif.';

-- ─── 3. IBAN locataire (pour restitution) ──────────────────────────────────

ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS iban_titulaire text;

COMMENT ON COLUMN public.profils.iban IS
  'V57 — IBAN du locataire pour réception du dépôt de garantie restitué. '
  'Optionnel (locataire peut le saisir ad-hoc au moment de la fin de bail).';
COMMENT ON COLUMN public.profils.iban_titulaire IS
  'V57 — Nom du titulaire du compte IBAN (peut différer du nom locataire si compte joint, etc.).';

-- ─── 4. RLS désactivée par défaut sur historique_baux ─────────────────────
-- L'accès se fait uniquement via /api server-side (supabaseAdmin bypass RLS).
-- REVOKE SELECT anon : pas dans le bundle client.

REVOKE ALL ON TABLE public.historique_baux FROM anon;
REVOKE ALL ON TABLE public.historique_baux FROM authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
