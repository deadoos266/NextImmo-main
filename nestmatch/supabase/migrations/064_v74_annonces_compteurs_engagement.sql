-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 064 — V74 : compteurs nb_vues + nb_candidatures sur annonces
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V74.4)
-- Date: 2026-05-06
-- Status: ✅ MIGRATION READY — APPLIQUER après deploy V74.4 en prod
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- Compteurs d'engagement pour le tri "Plus populaires" du listing /annonces
-- (V73.4 utilisait un proxy "qualité d'annonce" en attendant cette migration).
--
-- Note : KeyMatch n'a PAS de table `candidatures` dédiée. Une candidature est
-- un row de `public.messages` avec `type = 'candidature'`. Le 1er message
-- de candidature pour un couple (from_email, annonce_id) compte pour 1.
--
-- Idempotent (IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF EXISTS).

BEGIN;

-- ─── COLONNES ──────────────────────────────────────────────────────────────

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS nb_vues          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nb_candidatures  integer NOT NULL DEFAULT 0;

-- ─── TRIGGER nb_candidatures ───────────────────────────────────────────────
-- Incrément à l'INSERT d'une candidature (= 1er message d'un candidat sur
-- une annonce). Pour éviter de compter les multiples messages d'un même
-- candidat, on check qu'il n'existe pas déjà un message candidature de cet
-- emetteur sur cette annonce.

CREATE OR REPLACE FUNCTION public.fn_increment_annonce_nb_candidatures()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'candidature' AND NEW.annonce_id IS NOT NULL THEN
    -- Compte uniquement la 1re candidature de from_email sur cette annonce.
    IF NOT EXISTS (
      SELECT 1 FROM public.messages
       WHERE annonce_id = NEW.annonce_id
         AND from_email = NEW.from_email
         AND type = 'candidature'
         AND id <> NEW.id
    ) THEN
      UPDATE public.annonces
         SET nb_candidatures = nb_candidatures + 1
       WHERE id = NEW.annonce_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_nb_candidatures ON public.messages;
CREATE TRIGGER trg_increment_nb_candidatures
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.fn_increment_annonce_nb_candidatures();

-- ─── BACKFILL ──────────────────────────────────────────────────────────────
-- Met à jour le compteur depuis l'historique des candidatures existantes.
-- DISTINCT (annonce_id, from_email) compte 1 candidature par couple unique.

UPDATE public.annonces a
   SET nb_candidatures = COALESCE((
     SELECT COUNT(DISTINCT from_email)
       FROM public.messages
      WHERE annonce_id = a.id
        AND type = 'candidature'
   ), 0);

-- ─── INDEXES POUR ORDER BY ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_annonces_nb_vues
  ON public.annonces (nb_vues DESC);
CREATE INDEX IF NOT EXISTS idx_annonces_nb_candidatures
  ON public.annonces (nb_candidatures DESC);

-- Index composite pour tri "populaire" combiné (proxy SQL si besoin) :
--   ORDER BY (nb_candidatures * 3 + nb_vues / 100) DESC
-- → en pratique, le tri se fait côté JS dans AnnoncesClient (V74.4 UI), donc
-- pas besoin d'index expression. Les 2 index simples suffisent pour ORDER BY.

-- ─── PERMISSIONS ───────────────────────────────────────────────────────────
-- nb_vues / nb_candidatures sont public-readable (sur annonces accessibles).
-- L'écriture passe par les triggers + les routes API server-side avec
-- service_role. anon n'a jamais le droit d'écrire.

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── VÉRIFICATION POST-APPLY ───────────────────────────────────────────────
--
-- Schema check :
--   \d annonces        -- nb_vues, nb_candidatures (default 0)
--   \df fn_increment_annonce_nb_candidatures  -- function présente
--   \dt+ trigger trg_increment_nb_candidatures
--
-- Test backfill :
--   SELECT id, titre, nb_candidatures FROM annonces ORDER BY nb_candidatures DESC LIMIT 10;
--   -- doit retourner les annonces les plus candidaturées en premier.
--
-- Test trigger :
--   INSERT INTO messages (annonce_id, from_email, to_email, contenu, type)
--     VALUES (1, 'test@example.com', 'proprio@example.com', 'Hello', 'candidature');
--   SELECT nb_candidatures FROM annonces WHERE id = 1;
--   -- doit retourner +1 par rapport à avant l'INSERT.
--
--   -- Re-INSERT depuis le même from_email = pas d'incrément :
--   INSERT INTO messages (annonce_id, from_email, to_email, contenu, type)
--     VALUES (1, 'test@example.com', 'proprio@example.com', 'Relance', 'candidature');
--   SELECT nb_candidatures FROM annonces WHERE id = 1;
--   -- doit retourner LA MÊME valeur (pas d'incrément, déjà compté).
--
-- Test nb_vues :
--   -- nb_vues n'est pas alimenté par trigger. Update server-side dans
--   -- l'API qui charge la fiche annonce (cf app/api/annonces/[id]/view).
--   UPDATE annonces SET nb_vues = nb_vues + 1 WHERE id = 1;
