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
