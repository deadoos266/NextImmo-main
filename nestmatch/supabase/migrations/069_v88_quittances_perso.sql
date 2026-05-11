-- V88 — Table quittances_perso : quittances importées par le locataire.
--
-- Cas d'usage :
--   Un locataire a déjà payé son loyer pendant 6 mois hors plateforme
--   (bail signé en direct, virement manuel, quittance papier ou scannée
--   reçue par email). Maintenant qu'il rejoint KeyMatch via bail importé,
--   il veut conserver l'historique de ses paiements passés.
--
-- Différence avec `loyers` :
--   - `loyers` = quittances OFFICIELLES générées par le proprio sur KeyMatch.
--     Le proprio confirme un loyer reçu → /api/loyers/quittance génère le PDF
--     officiel signé KeyMatch et le stocke dans `loyers.quittance_pdf_url`.
--   - `quittances_perso` = archives PERSO du locataire. PDFs/JPG qu'il a déjà
--     en main, ou qu'il a scannés. Pas de génération, pas de validation
--     proprio, juste de l'archivage côté locataire pour son dossier perso.
--
-- Sécurité :
--   - Le locataire ne peut voir/upload QUE ses propres quittances perso.
--   - Le proprio ne voit PAS ces quittances perso (c'est l'archive du
--     locataire, pas une preuve juridique opposable).
--   - service_role bypass via /api/quittances/perso (auth check côté server).
--
-- Storage :
--   Bucket Supabase `quittances` existant (créé migration 020), arborescence :
--     /{locataire_email_safe}/perso-{timestamp}.pdf

BEGIN;

-- V88.1 — Ajout colonne bail_pdf_url sur annonces (pour bail importé).
-- La même colonne existe sur historique_baux (migration 054). Sur annonces
-- elle stocke le PDF importé pendant que le bail est encore actif.
-- Le proprio l'uploade via /proprietaire/bail/importer (route /api/bail/importer
-- côté server), et la valeur est ensuite copiée dans historique_baux au moment
-- de la clôture du bail (route /api/baux/relouer / fin_bail).
ALTER TABLE public.annonces ADD COLUMN IF NOT EXISTS bail_pdf_url text;

CREATE TABLE IF NOT EXISTS public.quittances_perso (
  id bigserial PRIMARY KEY,
  locataire_email text NOT NULL,
  annonce_id bigint REFERENCES public.annonces(id) ON DELETE SET NULL,
  -- Métadonnées saisies par le locataire
  mois text NOT NULL,                -- format YYYY-MM (ex: '2025-10')
  montant numeric(10,2),              -- loyer + charges, optionnel
  loyer_hc numeric(10,2),
  charges numeric(10,2),
  bailleur_nom text,                  -- bailleur de l'époque
  adresse_bien text,                  -- adresse du bien à l'époque
  note text,                          -- note libre locataire (ex: "payé en retard, accord verbal")
  -- Fichier (PDF ou image JPG/PNG)
  fichier_url text NOT NULL,
  fichier_nom text,
  fichier_taille_bytes int,
  fichier_type text CHECK (fichier_type IN ('pdf', 'image')),
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quittances_perso_locataire ON public.quittances_perso(locataire_email);
CREATE INDEX IF NOT EXISTS idx_quittances_perso_mois ON public.quittances_perso(locataire_email, mois DESC);
CREATE INDEX IF NOT EXISTS idx_quittances_perso_annonce ON public.quittances_perso(annonce_id) WHERE annonce_id IS NOT NULL;

-- Trigger updated_at auto
CREATE OR REPLACE FUNCTION public.set_updated_at_quittances_perso()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_quittances_perso_updated_at ON public.quittances_perso;
CREATE TRIGGER trg_quittances_perso_updated_at
  BEFORE UPDATE ON public.quittances_perso
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_quittances_perso();

-- Lockdown anon (toutes les opérations passent par /api/quittances/perso
-- qui authentifie via NextAuth et utilise supabaseAdmin).
REVOKE INSERT, UPDATE, DELETE ON TABLE public.quittances_perso FROM anon;
REVOKE SELECT ON TABLE public.quittances_perso FROM anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
