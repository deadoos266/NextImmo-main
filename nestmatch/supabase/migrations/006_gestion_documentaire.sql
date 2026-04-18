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
