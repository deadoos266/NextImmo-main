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
