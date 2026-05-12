-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 081 — V97.35 P3-3 — Reviews post-bail (double-aveugle)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Claude (V97.35)
-- Date: 2026-05-13
-- Status: READY TO APPLY
--
-- ─── PRÉREQUIS ─────────────────────────────────────────────────────────────
--
-- - historique_baux (mig 054) : ancrage pour l'éligibilité review (post-bail)
-- - annonces.bail_signe_locataire_at + bail_signe_bailleur_at (V32.5/V42) :
--   review mi-bail si bail actif depuis ≥6 mois
--
-- ─── SCOPE V97.35 ──────────────────────────────────────────────────────────
--
-- 1. Table `reviews` : note + commentaire écrits par UNE partie (locataire ou
--    proprio) sur l'autre, ancrée à une annonce (= bail unique).
--
-- 2. Mécanique double-aveugle :
--    - submitted_at : timestamp soumission
--    - published_at : NULL tant que l'autre partie n'a pas soumis. Quand la
--      2e partie soumet, on UPDATE les 2 rows simultanément avec
--      published_at = now() (transaction côté API route).
--    - Reveal forcé : un cron quotidien (reviews-auto-publish) publie les
--      reviews en attente depuis ≥7 jours pour éviter de bloquer une partie
--      qui a joué le jeu si l'autre ne soumet jamais.
--
-- 3. Unicité (annonce_id, author_email, target_email) : 1 review par
--    auteur par target par annonce. Permet le cas (peu probable) de plusieurs
--    baux successifs sur une annonce avec des locataires différents.
--
-- 4. Modération : reported (signalement user) + hidden_by_admin (modération).
--    Une review hidden_by_admin n'apparaît plus dans les listes publiques.
--
-- 5. RLS : SELECT public uniquement sur reviews publiées et non masquées.
--    INSERT/UPDATE/DELETE depuis anon REVOKED — tout passe par les API
--    routes qui vérifient l'éligibilité côté serveur (service_role).

BEGIN;

CREATE TABLE IF NOT EXISTS public.reviews (
  id                bigserial PRIMARY KEY,
  -- Ancrage bail
  annonce_id        integer NOT NULL,
  historique_bail_id bigint,   -- FK optionnelle vers historique_baux (NULL si review mi-bail)
  -- Parties
  author_email      text NOT NULL,
  target_email      text NOT NULL,
  -- Rôle de l'auteur (qui écrit) : 'locataire' = locataire qui note le proprio
  --                                  'proprietaire' = proprio qui note le locataire
  role              text NOT NULL CHECK (role IN ('locataire', 'proprietaire')),
  -- Notation
  score_global      smallint NOT NULL CHECK (score_global BETWEEN 1 AND 5),
  -- Détails 4 critères stockés en jsonb (flexibilité pour ajout futur)
  --   locataire → proprio : { reactivite, transparence, etat_logement, equite }
  --   proprio → locataire : { paiement_ponctuel, respect_logement, communication, voisinage }
  -- Chaque sous-note 1-5.
  score_details     jsonb DEFAULT '{}'::jsonb,
  comment           text CHECK (length(comment) <= 1500),
  -- Double-aveugle
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  published_at      timestamptz,  -- NULL = en attente de la review réciproque
  -- Modération
  reported          boolean NOT NULL DEFAULT false,
  reported_reason   text,
  reported_at       timestamptz,
  hidden_by_admin   boolean NOT NULL DEFAULT false,
  hidden_reason     text,
  -- Audit
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Contraintes
  CONSTRAINT reviews_annonce_fk
    FOREIGN KEY (annonce_id) REFERENCES public.annonces(id) ON DELETE CASCADE,
  CONSTRAINT reviews_historique_fk
    FOREIGN KEY (historique_bail_id) REFERENCES public.historique_baux(id) ON DELETE SET NULL,
  CONSTRAINT reviews_unique_author_target
    UNIQUE (annonce_id, author_email, target_email),
  CONSTRAINT reviews_no_self_review
    CHECK (author_email <> target_email)
);

-- Index : lookup des reviews publiques d'un user (page profil)
CREATE INDEX IF NOT EXISTS idx_reviews_target_published
  ON public.reviews (target_email, published_at DESC)
  WHERE published_at IS NOT NULL AND hidden_by_admin = false;

-- Index : "ai-je déjà écrit une review sur cette annonce ?"
CREATE INDEX IF NOT EXISTS idx_reviews_author_annonce
  ON public.reviews (author_email, annonce_id);

-- Index : reveal cron — trouve les reviews en attente depuis ≥14j
CREATE INDEX IF NOT EXISTS idx_reviews_pending_publish
  ON public.reviews (submitted_at)
  WHERE published_at IS NULL AND hidden_by_admin = false;

-- updated_at auto via trigger générique (déjà utilisé sur d'autres tables)
CREATE OR REPLACE FUNCTION public.reviews_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reviews_updated_at_trigger ON public.reviews;
CREATE TRIGGER reviews_updated_at_trigger
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.reviews_set_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- SELECT public : uniquement les reviews publiées et non masquées
DROP POLICY IF EXISTS reviews_select_published ON public.reviews;
CREATE POLICY reviews_select_published ON public.reviews
  FOR SELECT
  TO anon, authenticated
  USING (published_at IS NOT NULL AND hidden_by_admin = false);

-- L'auteur peut voir sa propre review même en attente (UI "ma review")
-- Note : on identifie l'auteur via le param email côté API service_role,
-- la RLS anon ne donnera jamais accès aux reviews non publiées. Cette
-- policy autenticated couvre uniquement le cas où on passe par PostgREST
-- avec un JWT custom (pas notre cas usuel, mais safety net).
DROP POLICY IF EXISTS reviews_select_own_pending ON public.reviews;
CREATE POLICY reviews_select_own_pending ON public.reviews
  FOR SELECT
  TO authenticated
  USING (author_email = current_setting('request.jwt.claims', true)::json->>'email');

-- REVOKE INSERT/UPDATE/DELETE depuis anon et authenticated — tout passe par
-- les routes API qui valident l'éligibilité (historique_baux match + pas
-- de doublon + double-aveugle).
REVOKE INSERT, UPDATE, DELETE ON public.reviews FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.reviews FROM authenticated;

COMMIT;

-- ─── ROLLBACK ──────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP TRIGGER IF EXISTS reviews_updated_at_trigger ON public.reviews;
--   DROP FUNCTION IF EXISTS public.reviews_set_updated_at();
--   DROP TABLE IF EXISTS public.reviews;
-- COMMIT;
