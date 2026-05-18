-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 086 — Phase A — Système d'intégration agences immobilières
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Claude (V97.39.34)
-- Date: 2026-05-18
-- Status: READY TO APPLY
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- Compte agence immobilière (loi Hoguet, carte professionnelle T) :
--   1. Table `agences` : entité business (SIRET, carte T, RC pro, logo, bio)
--   2. Table `agence_membres` : utilisateurs membres d'une agence avec role
--   3. Colonne `annonces.agence_id` nullable : permet à un user agence de
--      publier une annonce au nom de son agence (badge Pro affiché).
--
-- Workflow :
--   1. User inscrit son agence via /agence/inscription (statut='pending')
--   2. Il uploade carte T (PDF) → stocké MinIO bucket privé 'agences-docs'
--   3. Admin KeyMatch valide manuellement depuis /admin/agences
--   4. Si validé → statut='active', user peut publier annonces au nom agence
--   5. Si refusé → statut='refused', user peut éditer son dossier et resoumettre
--
-- Sécurité :
--   - Slug agence unique (utilisé dans URL publique /agence/[slug])
--   - SIRET unique (anti-doublon)
--   - Le numéro de carte T n'est PAS unique au niveau DB car une carte T
--     peut couvrir plusieurs agences (rare mais possible)
--   - Bucket `agences-docs` privé : signed URLs pour admin uniquement
--
-- Rollback :
--   DROP TABLE agence_membres CASCADE;
--   ALTER TABLE annonces DROP COLUMN agence_id;
--   DROP TABLE agences CASCADE;

BEGIN;

-- ─── 1. Table agences ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agences (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiant URL (ex: "century-21-bastille")
  slug              text NOT NULL UNIQUE
                    CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,60}[a-z0-9])?$'),

  -- Identité commerciale
  name              text NOT NULL,                        -- "Century 21 Bastille"
  raison_sociale    text NOT NULL,                        -- "BASTILLE IMMO SAS"
  siret             text NOT NULL UNIQUE
                    CHECK (siret ~ '^[0-9]{14}$'),        -- 14 chiffres INSEE

  -- Loi Hoguet : carte T obligatoire
  carte_t_numero    text NOT NULL,                        -- "CPI 7501 2018 000 042 069"
  carte_t_doc_path  text,                                 -- chemin MinIO bucket agences-docs

  -- Assurance RC pro (optionnel pour MVP, recommandé)
  rc_pro_doc_path   text,
  rc_pro_assureur   text,
  rc_pro_numero     text,

  -- Coordonnées
  email             text NOT NULL,
  telephone         text,
  adresse           text NOT NULL,
  code_postal       text,
  ville             text,

  -- Branding (V2 sur la page publique uniquement, pas sur annonces — décision Paul "hybride")
  logo_url          text,                                 -- URL publique MinIO
  couleur_primaire  text CHECK (couleur_primaire IS NULL OR couleur_primaire ~ '^#[0-9a-fA-F]{6}$'),
  bio               text,                                 -- description courte agence (~500 chars max côté UI)

  -- Workflow validation
  statut            text NOT NULL DEFAULT 'pending'
                    CHECK (statut IN ('pending', 'active', 'refused', 'banned')),
  validated_at      timestamptz,
  validated_by      text,                                 -- email admin qui a validé
  refused_reason    text,                                 -- raison du refus si statut='refused'

  -- Audit
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agences IS
  'Phase A — agences immobilières inscrites sur KeyMatch (loi Hoguet, carte T)';

CREATE INDEX IF NOT EXISTS idx_agences_statut
  ON public.agences (statut, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agences_ville
  ON public.agences (ville, code_postal)
  WHERE statut = 'active';

-- Trigger updated_at auto
CREATE OR REPLACE FUNCTION public.agences_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agences_updated_at ON public.agences;
CREATE TRIGGER trg_agences_updated_at
  BEFORE UPDATE ON public.agences
  FOR EACH ROW
  EXECUTE FUNCTION public.agences_set_updated_at();


-- ─── 2. Table agence_membres ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agence_membres (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agence_id       uuid NOT NULL REFERENCES public.agences(id) ON DELETE CASCADE,
  user_email      text NOT NULL,
  role            text NOT NULL DEFAULT 'agent'
                  CHECK (role IN ('owner', 'admin', 'agent', 'viewer')),
  invited_at      timestamptz NOT NULL DEFAULT now(),
  invited_by      text,                                   -- email du membre qui a invité
  joined_at       timestamptz,                            -- null tant que pas accepté
  removed_at      timestamptz,                            -- null tant que membre actif

  -- Un user ne peut être membre actif qu'une seule fois par agence
  CONSTRAINT uniq_agence_member_active
    UNIQUE NULLS NOT DISTINCT (agence_id, user_email, removed_at)
);

COMMENT ON TABLE public.agence_membres IS
  'Membres (employés/collaborateurs) d''une agence. Role owner=créateur, admin=gère équipe, agent=publie/gère annonces, viewer=lecture seule.';

CREATE INDEX IF NOT EXISTS idx_agence_membres_user_active
  ON public.agence_membres (user_email)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agence_membres_agence
  ON public.agence_membres (agence_id)
  WHERE removed_at IS NULL;


-- ─── 3. Colonne annonces.agence_id ─────────────────────────────────────────

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS agence_id uuid
  REFERENCES public.agences(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.annonces.agence_id IS
  'Si non-null, annonce publiée au nom de cette agence (badge Pro affiché). Si null, annonce particulier classique.';

CREATE INDEX IF NOT EXISTS idx_annonces_agence
  ON public.annonces (agence_id)
  WHERE agence_id IS NOT NULL;


-- ─── 4. Helper : check if email is member of agence with min role ──────────
--
-- Utilisé par les routes API pour valider qu'un user a le droit de publier
-- au nom d'une agence. Exemple :
--   SELECT public.user_can_act_for_agence('paul@example.com', '<uuid>', 'agent');
--   -> true si Paul est owner|admin|agent de cette agence, false sinon.

CREATE OR REPLACE FUNCTION public.user_can_act_for_agence(
  p_email text,
  p_agence_id uuid,
  p_min_role text
)
RETURNS boolean AS $$
DECLARE
  v_role_rank int;
  v_min_rank int;
BEGIN
  -- Rangs (plus haut = plus de droits)
  -- owner=4, admin=3, agent=2, viewer=1
  v_min_rank := CASE p_min_role
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'agent' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END;

  SELECT CASE role
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'agent' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END
  INTO v_role_rank
  FROM public.agence_membres
  WHERE user_email = lower(p_email)
    AND agence_id = p_agence_id
    AND removed_at IS NULL
    AND joined_at IS NOT NULL
  LIMIT 1;

  RETURN COALESCE(v_role_rank, 0) >= v_min_rank;
END;
$$ LANGUAGE plpgsql STABLE;


-- ─── 5. Sanity check / vérification finale ─────────────────────────────────

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM information_schema.tables
          WHERE table_name = 'agences' AND table_schema = 'public') = 1;
  ASSERT (SELECT count(*) FROM information_schema.tables
          WHERE table_name = 'agence_membres' AND table_schema = 'public') = 1;
  ASSERT (SELECT count(*) FROM information_schema.columns
          WHERE table_name = 'annonces' AND column_name = 'agence_id') = 1;
END $$;

COMMIT;
