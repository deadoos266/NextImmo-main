-- ==============================================================================
-- NESTMATCH — SETUP STAGING DATABASE
-- Baseline + migrations 001-010 + buckets Storage
--
-- Projet STAGING : wvjqhlutbdtwctojbcep
-- URL SQL Editor : https://supabase.com/dashboard/project/wvjqhlutbdtwctojbcep/sql/new
-- ==============================================================================


-- ============================================================================
-- supabase/migrations/000_baseline_schema.sql
-- ============================================================================
-- =============================================================================
-- 000_baseline_schema.sql
--
-- Schéma initial reconstitué — les tables centrales n'avaient pas été
-- versionnées (créées à la main au début du projet). Nécessaire pour démarrer
-- un environnement staging from scratch.
--
-- Idempotent : CREATE TABLE IF NOT EXISTS + colonnes tolérantes.
-- =============================================================================

-- ─── profils ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profils (
  email             text PRIMARY KEY,
  nom               text,
  telephone         text,
  situation_pro     text,
  revenus_mensuels  numeric,
  nb_occupants      integer DEFAULT 1,
  garant            boolean DEFAULT false,
  type_garant       text,
  ville_souhaitee   text,
  budget_min        integer,
  budget_max        integer,
  surface_min       integer,
  surface_max       integer,
  pieces_min        integer,
  chambres_min      integer,
  dpe_min           text,
  type_bail         text,
  mode_localisation text,
  type_quartier     text,
  animaux           boolean DEFAULT false,
  meuble            boolean DEFAULT false,
  parking           boolean DEFAULT false,
  cave              boolean DEFAULT false,
  fibre             boolean DEFAULT false,
  balcon            boolean DEFAULT false,
  terrasse          boolean DEFAULT false,
  jardin            boolean DEFAULT false,
  ascenseur         boolean DEFAULT false,
  rez_de_chaussee_ok boolean DEFAULT true,
  fumeur            boolean DEFAULT false,
  proximite_metro   boolean DEFAULT false,
  proximite_ecole   boolean DEFAULT false,
  proximite_commerces boolean DEFAULT false,
  proximite_parcs   boolean DEFAULT false,
  profil_locataire  text,
  is_proprietaire   boolean DEFAULT false,
  dossier_docs      jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── annonces ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.annonces (
  id                serial PRIMARY KEY,
  titre             text NOT NULL,
  ville             text,
  adresse           text,
  prix              integer,
  charges           integer,
  caution           integer,
  surface           integer,
  pieces            integer,
  chambres          integer,
  etage             text,
  dpe               text,
  dispo             text,
  statut            text DEFAULT 'disponible',
  description       text,
  type_bien         text,
  photos            jsonb,
  meuble            boolean DEFAULT false,
  animaux           boolean DEFAULT false,
  parking           boolean DEFAULT false,
  cave              boolean DEFAULT false,
  fibre             boolean DEFAULT false,
  balcon            boolean DEFAULT false,
  terrasse          boolean DEFAULT false,
  jardin            boolean DEFAULT false,
  ascenseur         boolean DEFAULT false,
  localisation_exacte boolean DEFAULT false,
  lat               numeric,
  lng               numeric,
  proprietaire      text,
  proprietaire_email text,
  membre            text,
  verifie           boolean DEFAULT false,
  locataire_email   text,
  date_debut_bail   date,
  mensualite_credit integer,
  valeur_bien       integer,
  duree_credit      integer,
  taxe_fonciere     integer,
  assurance_pno     integer,
  charges_copro_annuelles integer,
  bail_genere_at    timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── messages ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id          bigserial PRIMARY KEY,
  from_email  text NOT NULL,
  to_email    text NOT NULL,
  contenu     text,
  annonce_id  integer,
  lu          boolean DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── loyers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loyers (
  id          bigserial PRIMARY KEY,
  annonce_id  integer NOT NULL,
  mois        text NOT NULL,
  montant     numeric,
  statut      text DEFAULT 'déclaré',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── etats_des_lieux ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.etats_des_lieux (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id      integer,
  email_locataire text,
  type            text DEFAULT 'entree',
  date_edl        date,
  statut          text DEFAULT 'brouillon',
  pieces          jsonb,
  date_validation timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── clics_annonces ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clics_annonces (
  id          bigserial PRIMARY KEY,
  annonce_id  integer NOT NULL,
  email       text NOT NULL,
  UNIQUE(annonce_id, email)
);

-- NOTE : les tables `contacts` et `signalements` sont créées par la
-- migration 004_batch26_security_hardening.sql — ne pas les dupliquer ici.

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- supabase/migrations/001_create_users.sql
-- ============================================================================
-- NestMatch users table for authentication
-- Run this in the Supabase SQL editor or via the Supabase CLI

CREATE TABLE IF NOT EXISTS public.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text,          -- NULL for OAuth-only users (e.g. Google)
  name          text,
  image         text,
  role          text NOT NULL DEFAULT 'locataire' CHECK (role IN ('locataire', 'proprietaire')),
  is_admin      boolean NOT NULL DEFAULT false,
  email_verified boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index for fast lookup by email (used in login)
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users (email);

-- ============================================================================
-- supabase/migrations/002_create_carnet_entretien.sql
-- ============================================================================
-- Carnet d'entretien par bien immobilier
CREATE TABLE IF NOT EXISTS public.carnet_entretien (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id        integer NOT NULL,
  proprietaire_email text NOT NULL,
  locataire_email   text,
  titre             text NOT NULL,
  description       text,
  type              text NOT NULL DEFAULT 'autre' CHECK (type IN ('chaudière','plomberie','électricité','travaux','serrurerie','nuisibles','autre')),
  statut            text NOT NULL DEFAULT 'planifié' CHECK (statut IN ('planifié','en cours','terminé')),
  date_evenement    date,
  cout              integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carnet_annonce_idx ON public.carnet_entretien (annonce_id);
CREATE INDEX IF NOT EXISTS carnet_proprio_idx ON public.carnet_entretien (proprietaire_email);

-- ============================================================================
-- supabase/migrations/003_create_visites.sql
-- ============================================================================
-- Booking de visites
CREATE TABLE IF NOT EXISTS public.visites (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id        integer NOT NULL,
  locataire_email   text NOT NULL,
  proprietaire_email text NOT NULL,
  date_visite       date NOT NULL,
  heure             text NOT NULL,
  message           text,
  statut            text NOT NULL DEFAULT 'proposée'
                    CHECK (statut IN ('proposée', 'confirmée', 'annulée', 'effectuée')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visites_annonce_idx ON public.visites (annonce_id);
CREATE INDEX IF NOT EXISTS visites_locataire_idx ON public.visites (locataire_email);
CREATE INDEX IF NOT EXISTS visites_proprio_idx ON public.visites (proprietaire_email);

-- ============================================================================
-- supabase/migrations/004_batch26_security_hardening.sql
-- ============================================================================
-- Batch 26 — Durcissement sécurité : migrations pending consolidées
-- Regroupe toutes les colonnes / tables ajoutées aux batchs 6, 12-bis, 13, 15, 16
-- et qui n'avaient pas été appliquées côté Supabase.
--
-- Exécuter DANS L'ORDRE via Supabase SQL Editor.
-- Toutes les opérations sont idempotentes (IF NOT EXISTS).

-- ─── 1. Géolocalisation exacte du bien (batch 16 + 6) ─────────────────────────
ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS lat                 double precision NULL,
  ADD COLUMN IF NOT EXISTS lng                 double precision NULL,
  ADD COLUMN IF NOT EXISTS localisation_exacte boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_annonces_coords
  ON public.annonces(lat, lng)
  WHERE lat IS NOT NULL;

-- ─── 2. Flow visite — qui a proposé (batch 6) ─────────────────────────────────
ALTER TABLE public.visites
  ADD COLUMN IF NOT EXISTS propose_par text NULL;

CREATE INDEX IF NOT EXISTS idx_visites_propose_par
  ON public.visites(propose_par);

-- ─── 3. Soft-ban utilisateur (batch 12-bis) ───────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_banned  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_reason text NULL;

-- ─── 4. Signalements (batch 13) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.signalements (
  id             bigserial PRIMARY KEY,
  type           text NOT NULL CHECK (type IN ('annonce', 'user', 'message')),
  target_id      text NOT NULL,
  raison         text NOT NULL,
  description    text NULL,
  signale_par    text NOT NULL,
  statut         text NOT NULL DEFAULT 'ouvert'
                 CHECK (statut IN ('ouvert', 'traite', 'rejete')),
  traite_par     text NULL,
  traite_at      timestamptz NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signalements_statut       ON public.signalements(statut);
CREATE INDEX IF NOT EXISTS idx_signalements_signale_par  ON public.signalements(signale_par);
CREATE INDEX IF NOT EXISTS idx_signalements_target       ON public.signalements(type, target_id);

-- ─── 5. Contact (batch 15) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id          bigserial PRIMARY KEY,
  nom         text NOT NULL,
  email       text NOT NULL,
  sujet       text NOT NULL,
  message     text NOT NULL,
  statut      text NOT NULL DEFAULT 'ouvert'
              CHECK (statut IN ('ouvert', 'en_cours', 'resolu')),
  assigne_a   text NULL,
  reponse     text NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_statut    ON public.contacts(statut);
CREATE INDEX IF NOT EXISTS idx_contacts_assigne_a ON public.contacts(assigne_a);
CREATE INDEX IF NOT EXISTS idx_contacts_email     ON public.contacts(email);

-- ─── 6. RLS — activer sur visites et carnet_entretien ─────────────────────────
-- Avant : RLS désactivée → n'importe qui avec l'anon key pouvait tout lire.
-- Après : locataire voit ses propres visites, proprio voit celles de ses biens.

ALTER TABLE public.visites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carnet_entretien ENABLE ROW LEVEL SECURITY;

-- Policies visites : accès par email authentifié (locataire OU proprio)
DROP POLICY IF EXISTS "visites_select_own" ON public.visites;
CREATE POLICY "visites_select_own" ON public.visites
  FOR SELECT TO authenticated
  USING (
    auth.jwt() ->> 'email' = locataire_email
    OR auth.jwt() ->> 'email' = proprietaire_email
  );

DROP POLICY IF EXISTS "visites_insert_own" ON public.visites;
CREATE POLICY "visites_insert_own" ON public.visites
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.jwt() ->> 'email' = locataire_email
    OR auth.jwt() ->> 'email' = proprietaire_email
  );

DROP POLICY IF EXISTS "visites_update_own" ON public.visites;
CREATE POLICY "visites_update_own" ON public.visites
  FOR UPDATE TO authenticated
  USING (
    auth.jwt() ->> 'email' = locataire_email
    OR auth.jwt() ->> 'email' = proprietaire_email
  );

-- Policies carnet_entretien : proprio OU locataire rattaché au bien
DROP POLICY IF EXISTS "carnet_select_own" ON public.carnet_entretien;
CREATE POLICY "carnet_select_own" ON public.carnet_entretien
  FOR SELECT TO authenticated
  USING (
    auth.jwt() ->> 'email' = proprietaire_email
    OR auth.jwt() ->> 'email' = locataire_email
  );

DROP POLICY IF EXISTS "carnet_insert_own" ON public.carnet_entretien;
CREATE POLICY "carnet_insert_own" ON public.carnet_entretien
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.jwt() ->> 'email' = proprietaire_email
    OR auth.jwt() ->> 'email' = locataire_email
  );

DROP POLICY IF EXISTS "carnet_update_own" ON public.carnet_entretien;
CREATE POLICY "carnet_update_own" ON public.carnet_entretien
  FOR UPDATE TO authenticated
  USING (
    auth.jwt() ->> 'email' = proprietaire_email
    OR auth.jwt() ->> 'email' = locataire_email
  );

-- NOTE : si les API routes utilisent supabaseAdmin (service_role),
-- les policies sont bypassées — OK tant que l'email est lu depuis
-- getServerSession côté route, jamais depuis le body.

-- ============================================================================
-- supabase/migrations/005_storage_bucket_policies.sql
-- ============================================================================
-- Batch 26 — Durcissement Storage : MIME + taille enforcés côté serveur
-- La validation client dans lib/fileValidation.ts est bypassable.
-- Vraie défense : bucket policies Supabase Storage.
--
-- À exécuter DANS Supabase → SQL Editor.
-- Si tu préfères l'UI : Dashboard → Storage → <bucket> → Configuration
-- tu retrouves les mêmes champs (allowed_mime_types, file_size_limit).

-- ─── Bucket annonces-photos (photos biens + EDL) ──────────────────────────────
-- Images uniquement, 10 Mo max par fichier
UPDATE storage.buckets
   SET public              = true,
       file_size_limit     = 10485760,  -- 10 Mo
       allowed_mime_types  = ARRAY[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'image/heif'
       ]
 WHERE id = 'annonces-photos';

-- Si le bucket n'existe pas encore, le créer :
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'annonces-photos', 'annonces-photos', true, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- ─── Bucket dossiers (dossier locataire : pièces + justificatifs) ─────────────
-- Images + PDF, 15 Mo max
UPDATE storage.buckets
   SET public              = true,
       file_size_limit     = 15728640,  -- 15 Mo
       allowed_mime_types  = ARRAY[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'image/heif',
         'application/pdf'
       ]
 WHERE id = 'dossiers';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dossiers', 'dossiers', true, 15728640,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ─── Policies RLS storage.objects ─────────────────────────────────────────────
-- L'utilisateur connecté ne peut upload QUE dans son propre dossier
-- (path commence par son email). Lecture publique (les URLs sont dans les annonces).

-- annonces-photos : insert own folder only
DROP POLICY IF EXISTS "annonces_photos_insert_own" ON storage.objects;
CREATE POLICY "annonces_photos_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'annonces-photos'
    AND (storage.foldername(name))[1] = auth.jwt() ->> 'email'
    -- Le sous-dossier "edl/..." utilise un préfixe différent : autoriser aussi
    OR (bucket_id = 'annonces-photos' AND name LIKE 'edl/' || (auth.jwt() ->> 'email') || '/%')
  );

DROP POLICY IF EXISTS "annonces_photos_select_public" ON storage.objects;
CREATE POLICY "annonces_photos_select_public" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'annonces-photos');

DROP POLICY IF EXISTS "annonces_photos_delete_own" ON storage.objects;
CREATE POLICY "annonces_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'annonces-photos'
    AND (
      (storage.foldername(name))[1] = auth.jwt() ->> 'email'
      OR name LIKE 'edl/' || (auth.jwt() ->> 'email') || '/%'
    )
  );

-- dossiers : insert own folder only, lecture publique (URLs dans table profils)
DROP POLICY IF EXISTS "dossiers_insert_own" ON storage.objects;
CREATE POLICY "dossiers_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dossiers'
    AND (storage.foldername(name))[1] = auth.jwt() ->> 'email'
  );

DROP POLICY IF EXISTS "dossiers_select_public" ON storage.objects;
CREATE POLICY "dossiers_select_public" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'dossiers');

DROP POLICY IF EXISTS "dossiers_delete_own" ON storage.objects;
CREATE POLICY "dossiers_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dossiers'
    AND (storage.foldername(name))[1] = auth.jwt() ->> 'email'
  );

-- ============================================================================
-- supabase/migrations/006_gestion_documentaire.sql
-- ============================================================================
-- Batch 35 — Gestion documentaire : câbler tous les documents au locataire
-- actif + tracer les envois. À exécuter dans Supabase SQL Editor.
--
-- Objectif : bail + EDL + quittances + dossier tous reliés à annonce +
-- locataire_email + proprietaire_email. Permet :
--   - messagerie 2 sections (Biens loués vs Candidatures)
--   - isolation candidat / locataire actif
--   - traçabilité de chaque document envoyé
--
-- Idempotent (IF NOT EXISTS partout).

-- ─── 1. LOYERS : lier au locataire + proprio + tracer l'envoi quittance ──────
ALTER TABLE public.loyers
  ADD COLUMN IF NOT EXISTS locataire_email       text NULL,
  ADD COLUMN IF NOT EXISTS proprietaire_email    text NULL,
  ADD COLUMN IF NOT EXISTS date_confirmation     timestamptz NULL,
  ADD COLUMN IF NOT EXISTS quittance_envoyee_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS quittance_message_id  bigint NULL;

CREATE INDEX IF NOT EXISTS loyers_locataire_idx ON public.loyers(locataire_email);
CREATE INDEX IF NOT EXISTS loyers_proprio_idx   ON public.loyers(proprietaire_email);
CREATE INDEX IF NOT EXISTS loyers_annonce_idx   ON public.loyers(annonce_id);

-- Back-fill depuis l'annonce (si colonnes remplies côté annonce)
UPDATE public.loyers l
   SET locataire_email    = COALESCE(l.locataire_email,    a.locataire_email),
       proprietaire_email = COALESCE(l.proprietaire_email, a.proprietaire_email)
  FROM public.annonces a
 WHERE l.annonce_id = a.id
   AND (l.locataire_email IS NULL OR l.proprietaire_email IS NULL);

-- ─── 2. ÉTATS DES LIEUX : relier explicitement au locataire actif ────────────
ALTER TABLE public.etats_des_lieux
  ADD COLUMN IF NOT EXISTS locataire_email    text NULL,
  ADD COLUMN IF NOT EXISTS proprietaire_email text NULL;

CREATE INDEX IF NOT EXISTS edl_locataire_idx ON public.etats_des_lieux(locataire_email);
CREATE INDEX IF NOT EXISTS edl_proprio_idx   ON public.etats_des_lieux(proprietaire_email);

UPDATE public.etats_des_lieux e
   SET locataire_email    = COALESCE(e.locataire_email,    a.locataire_email),
       proprietaire_email = COALESCE(e.proprietaire_email, a.proprietaire_email)
  FROM public.annonces a
 WHERE e.annonce_id = a.id
   AND (e.locataire_email IS NULL OR e.proprietaire_email IS NULL);

-- ─── 3. ANNONCES : tracer la génération de bail ──────────────────────────────
ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS bail_genere_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS annonces_locataire_idx ON public.annonces(locataire_email)
  WHERE locataire_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS annonces_proprio_idx   ON public.annonces(proprietaire_email);

-- ─── 4. MESSAGES : s'assurer que l'index annonce_id existe ───────────────────
CREATE INDEX IF NOT EXISTS messages_annonce_idx ON public.messages(annonce_id)
  WHERE annonce_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_from_idx ON public.messages(from_email);
CREATE INDEX IF NOT EXISTS messages_to_idx   ON public.messages(to_email);

-- ─── 5. CARNET D'ENTRETIEN : cohérence avec le locataire actif ───────────────
-- carnet_entretien a déjà annonce_id. On back-fill locataire_email si absent.
ALTER TABLE public.carnet_entretien
  ADD COLUMN IF NOT EXISTS locataire_email    text NULL,
  ADD COLUMN IF NOT EXISTS proprietaire_email text NULL;

UPDATE public.carnet_entretien c
   SET locataire_email    = COALESCE(c.locataire_email,    a.locataire_email),
       proprietaire_email = COALESCE(c.proprietaire_email, a.proprietaire_email)
  FROM public.annonces a
 WHERE c.annonce_id = a.id
   AND (c.locataire_email IS NULL OR c.proprietaire_email IS NULL);

-- ─── NOTES ───────────────────────────────────────────────────────────────────
-- Le bucket Storage "quittances" sera créé à la demande par le code applicatif
-- (OU manuellement dans Supabase Dashboard → Storage → New bucket "quittances").
-- Pour la v1, les PDFs de quittance sont générés côté client et envoyés inline
-- dans le chat via [QUITTANCE_CARD] — pas de stockage persistant pour l'instant.

-- ============================================================================
-- supabase/migrations/007_profil_dossier_complet.sql
-- ============================================================================
-- =============================================================================
-- 007_profil_dossier_complet.sql
--
-- Étend la table `profils` pour un dossier locataire complet (type DossierFacile).
-- Crée `dossier_access_log` pour tracer les accès aux dossiers partagés.
--
-- Idempotent : utilise IF NOT EXISTS / ADD COLUMN IF NOT EXISTS partout.
-- Safe à rejouer.
-- =============================================================================

-- ─── Extension de profils : identité + famille + logement + pro ─────────────
ALTER TABLE IF EXISTS profils
  ADD COLUMN IF NOT EXISTS date_naissance        date,
  ADD COLUMN IF NOT EXISTS nationalite           text,
  ADD COLUMN IF NOT EXISTS situation_familiale   text,  -- celibataire|couple|marie|pacs|divorce|veuf
  ADD COLUMN IF NOT EXISTS nb_enfants            integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employeur_nom         text,
  ADD COLUMN IF NOT EXISTS date_embauche         date,
  ADD COLUMN IF NOT EXISTS logement_actuel_type  text,  -- locataire|proprietaire|heberge|foyer|colocation|autre
  ADD COLUMN IF NOT EXISTS logement_actuel_ville text,
  ADD COLUMN IF NOT EXISTS presentation          text,  -- lettre de présentation libre (500 car max)
  ADD COLUMN IF NOT EXISTS a_apl                 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mobilite_pro          boolean DEFAULT false; -- déménagement prof (Visale +)

-- ─── Contraintes de cohérence ──────────────────────────────────────────────
-- Date de naissance plausible (majorité + pas plus de 120 ans)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_profils_date_naissance_plausible') THEN
    ALTER TABLE profils ADD CONSTRAINT chk_profils_date_naissance_plausible
      CHECK (date_naissance IS NULL OR (date_naissance <= CURRENT_DATE - INTERVAL '16 years'
                                        AND date_naissance >= CURRENT_DATE - INTERVAL '120 years'));
  END IF;
END $$;

-- nb_enfants raisonnable
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_profils_nb_enfants') THEN
    ALTER TABLE profils ADD CONSTRAINT chk_profils_nb_enfants
      CHECK (nb_enfants IS NULL OR (nb_enfants >= 0 AND nb_enfants <= 15));
  END IF;
END $$;

-- Presentation limitée à 500 caractères côté DB (client valide aussi mais défense en profondeur)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_profils_presentation_length') THEN
    ALTER TABLE profils ADD CONSTRAINT chk_profils_presentation_length
      CHECK (presentation IS NULL OR length(presentation) <= 500);
  END IF;
END $$;

-- ─── Index pour requêtes de filtrage / stats ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profils_situation_pro ON profils(situation_pro);
CREATE INDEX IF NOT EXISTS idx_profils_ville_souhaitee ON profils(ville_souhaitee);

-- ─── Logs d'accès au dossier partagé ───────────────────────────────────────
-- Permet au locataire de voir qui a consulté son dossier et quand.
-- Le token est haché (pas de stockage brut) — seuls les 10 premiers
-- caractères du hash sont stockés pour reconnaître la session sans exposer.
CREATE TABLE IF NOT EXISTS dossier_access_log (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL,                 -- email du locataire propriétaire du dossier
  token_hash  text NOT NULL,                 -- hash SHA-256 du token (premiers 16 char)
  ip_hash     text,                          -- hash IP consultant (anonymisation RGPD)
  user_agent  text,                          -- UA tronqué à 200 char
  accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dossier_access_log_email ON dossier_access_log(email, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dossier_access_log_token ON dossier_access_log(token_hash);

-- Purge automatique après 90 jours (RGPD). Créé une fonction puis on l'appelle
-- via cron externe (Supabase pg_cron ou Vercel cron) — ici juste la fonction.
CREATE OR REPLACE FUNCTION purge_dossier_access_log_old()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM dossier_access_log WHERE accessed_at < now() - INTERVAL '90 days';
$$;

COMMENT ON TABLE dossier_access_log IS 'Logs des accès aux dossiers partagés via token HMAC. Purge 90j (RGPD).';
COMMENT ON COLUMN dossier_access_log.token_hash IS 'SHA-256(token) tronqué à 16 caractères — permet de grouper les accès d''un même lien sans stocker le token.';
COMMENT ON COLUMN dossier_access_log.ip_hash IS 'SHA-256(ip + salt) — anonymisation conforme RGPD.';

-- ============================================================================
-- supabase/migrations/008_parametres_profil_public.sql
-- ============================================================================
-- =============================================================================
-- 008_parametres_profil_public.sql
--
-- Champs d'affichage public (bio, photo custom) + préférences notifications.
-- Supporte la future page /parametres.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE IF EXISTS profils
  ADD COLUMN IF NOT EXISTS bio_publique              text,
  ADD COLUMN IF NOT EXISTS photo_url_custom          text,
  ADD COLUMN IF NOT EXISTS notif_messages_email      boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_visites_email       boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_candidatures_email  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_loyer_retard_email  boolean DEFAULT true;

-- Limite longueur bio (défense en profondeur — client valide aussi)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_profils_bio_length') THEN
    ALTER TABLE profils ADD CONSTRAINT chk_profils_bio_length
      CHECK (bio_publique IS NULL OR length(bio_publique) <= 300);
  END IF;
END $$;

COMMENT ON COLUMN profils.photo_url_custom IS 'URL photo uploadée via /api/account/avatar. Priorité sur users.image (Google OAuth). NULL = utilise la photo Google.';
COMMENT ON COLUMN profils.bio_publique IS 'Bio courte affichée sur le profil public (vue proprio). Max 300 caractères.';

-- ============================================================================
-- supabase/migrations/009_profils_nullable_fields.sql
-- ============================================================================
-- =============================================================================
-- 009_profils_nullable_fields.sql
--
-- Corrige un verrou hérité : la colonne `profils.nom` était NOT NULL, ce qui
-- bloque tout upsert partiel (ex : uploader une photo de profil quand le
-- dossier locataire n'a pas encore été rempli).
--
-- `email` reste la seule clé obligatoire (PK). Tous les autres champs de
-- contenu deviennent nullable — le client valide déjà les règles côté UI.
--
-- Idempotent : DROP NOT NULL est sûr à rejouer.
-- =============================================================================

-- On relâche les contraintes NOT NULL seulement si elles existent.
-- La forme ALTER COLUMN ... DROP NOT NULL est no-op si déjà nullable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profils' AND column_name = 'nom' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE profils ALTER COLUMN nom DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profils' AND column_name = 'telephone' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE profils ALTER COLUMN telephone DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profils' AND column_name = 'situation_pro' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE profils ALTER COLUMN situation_pro DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profils' AND column_name = 'profil_locataire' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE profils ALTER COLUMN profil_locataire DROP NOT NULL;
  END IF;
END $$;

-- Force PostgREST à recharger le schéma (sinon l'API cache l'ancienne contrainte)
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- supabase/migrations/010_indexes_performance.sql
-- ============================================================================
-- =============================================================================
-- 010_indexes_performance.sql
--
-- Indexes de performance sur les colonnes de filtre fréquentes.
-- Idempotent (IF NOT EXISTS). À appliquer sur staging puis prod.
--
-- Benchmark attendu : passage Seq Scan → Index Scan sur requêtes :
--   - /annonces filtré ville + statut
--   - /messages d'une conv (from+to+annonce_id)
--   - /visites d'un user
-- =============================================================================

-- ─── annonces ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_annonces_ville           ON annonces(ville);
CREATE INDEX IF NOT EXISTS idx_annonces_statut          ON annonces(statut);
CREATE INDEX IF NOT EXISTS idx_annonces_prix            ON annonces(prix);
CREATE INDEX IF NOT EXISTS idx_annonces_proprietaire    ON annonces(proprietaire_email);
CREATE INDEX IF NOT EXISTS idx_annonces_locataire       ON annonces(locataire_email);
-- Composite pour la recherche publique : par ville en excluant les loués
CREATE INDEX IF NOT EXISTS idx_annonces_ville_statut
  ON annonces(ville, statut) WHERE statut IS DISTINCT FROM 'loué';

-- ─── messages ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_to_email        ON messages(to_email);
CREATE INDEX IF NOT EXISTS idx_messages_from_email      ON messages(from_email);
CREATE INDEX IF NOT EXISTS idx_messages_annonce_id      ON messages(annonce_id) WHERE annonce_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_created_at      ON messages(created_at DESC);
-- Badge non-lu : WHERE to_email = X AND lu = false
CREATE INDEX IF NOT EXISTS idx_messages_unread          ON messages(to_email) WHERE lu = false;

-- ─── visites ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_visites_proprietaire     ON visites(proprietaire_email);
CREATE INDEX IF NOT EXISTS idx_visites_locataire        ON visites(locataire_email);
CREATE INDEX IF NOT EXISTS idx_visites_annonce          ON visites(annonce_id);
CREATE INDEX IF NOT EXISTS idx_visites_statut_date      ON visites(statut, date_visite);

-- ─── loyers ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loyers_annonce           ON loyers(annonce_id);
CREATE INDEX IF NOT EXISTS idx_loyers_locataire         ON loyers(locataire_email);
CREATE INDEX IF NOT EXISTS idx_loyers_mois              ON loyers(mois);
CREATE INDEX IF NOT EXISTS idx_loyers_statut            ON loyers(statut);

-- ─── etats_des_lieux ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_edl_annonce              ON etats_des_lieux(annonce_id);
CREATE INDEX IF NOT EXISTS idx_edl_locataire            ON etats_des_lieux(locataire_email);
CREATE INDEX IF NOT EXISTS idx_edl_proprietaire         ON etats_des_lieux(proprietaire_email);

-- ─── carnet_entretien ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_carnet_annonce           ON carnet_entretien(annonce_id);
CREATE INDEX IF NOT EXISTS idx_carnet_proprietaire      ON carnet_entretien(proprietaire_email);
CREATE INDEX IF NOT EXISTS idx_carnet_locataire         ON carnet_entretien(locataire_email);

-- ─── clics_annonces ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clics_annonce            ON clics_annonces(annonce_id);

-- ─── signalements ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_signalements_statut      ON signalements(statut);
CREATE INDEX IF NOT EXISTS idx_signalements_type        ON signalements(type);

-- ─── Statistiques fraîches + reload PostgREST ────────────────────────────────
ANALYZE annonces;
ANALYZE messages;
ANALYZE visites;
ANALYZE loyers;
ANALYZE etats_des_lieux;
ANALYZE carnet_entretien;

NOTIFY pgrst, 'reload schema';

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- FIN. Buckets annonces-photos + dossiers créés via 005 SQL.
-- Reste à créer MANUELLEMENT le bucket 'avatars' (public=true)
-- via Dashboard → Storage → + New bucket.
-- ==============================================================================
