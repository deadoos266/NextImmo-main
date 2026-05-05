-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 062 — V70 colonnes + index UNIQUE + table irl_history
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V70)
-- Date: 2026-05-05
-- Status: ✅ MIGRATION READY — APPLIQUER après déploiement V70.* en prod
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- 1. Colonnes V70.2 — préavis vente (droit préemption locataire)
-- 2. Colonnes V70.3 — visites no-show + score profils
-- 3. Colonnes V70.4 — EDL contestation expirée
-- 4. Index UNIQUE V70.5 — bail_invitations pending unique par annonce
-- 5. Table V70.7 — irl_history (cron INSEE scrape)
--
-- Tout est idempotent (IF NOT EXISTS / CREATE OR REPLACE / ALTER ... IF NOT EXISTS).

BEGIN;

-- ─── V70.2 — Préavis vente : droit préemption locataire (loi 89-462 art. 15-II)

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS preavis_vente_prix numeric,
  ADD COLUMN IF NOT EXISTS preavis_vente_conditions text;

-- ─── V70.3 — Visites no-show + score profils

-- Colonnes visites pour signalement no-show
ALTER TABLE public.visites
  ADD COLUMN IF NOT EXISTS no_show_partie text,         -- 'locataire' | 'proprio'
  ADD COLUMN IF NOT EXISTS no_show_signale_par text,    -- 'locataire' | 'proprio'
  ADD COLUMN IF NOT EXISTS no_show_signale_at timestamptz;

-- Score no-show côté profils (impact recommandation matching)
ALTER TABLE public.profils
  ADD COLUMN IF NOT EXISTS no_show_count integer NOT NULL DEFAULT 0;

-- ─── V70.4 — EDL contestation expirée (cron J+30 ADIL)

ALTER TABLE public.etats_des_lieux
  ADD COLUMN IF NOT EXISTS contestation_expiree_at timestamptz;

-- ─── V70.5 — UNIQUE partial bail_invitations pending par annonce

-- Empêche 2 bail_invitations actives sur la même annonce. Le check
-- existing pre-insert dans /api/bail/from-annonce gère le cas séquentiel
-- mais pas concurrent → cette contrainte ferme la race.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bail_invitations_pending_per_annonce
  ON public.bail_invitations(annonce_id)
  WHERE statut = 'pending';

-- ─── V70.7 — Table irl_history (cron INSEE scrape monthly)

CREATE TABLE IF NOT EXISTS public.irl_history (
  trimestre        text PRIMARY KEY,                 -- 'T1 2026'
  annee            integer NOT NULL,
  trim_num         smallint NOT NULL CHECK (trim_num BETWEEN 1 AND 4),
  indice           numeric(6,2) NOT NULL,
  publication_date text,
  scrapped_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Index pour ORDER BY annee, trim_num desc (used by lib/irlFromDb)
CREATE INDEX IF NOT EXISTS idx_irl_history_annee_trim
  ON public.irl_history(annee DESC, trim_num DESC);

-- Grants : SELECT autorisé pour authenticated (proprio lit pour calculer
-- indexation IRL). INSERT/UPDATE uniquement service_role (cron).
GRANT SELECT ON TABLE public.irl_history TO authenticated;
-- Anon : pas de SELECT (pas de besoin lecture publique)

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── VÉRIFICATION POST-APPLY ───────────────────────────────────────────────
--
-- Schema check :
--   \d annonces            -- preavis_vente_prix, preavis_vente_conditions
--   \d visites             -- no_show_partie, no_show_signale_par, no_show_signale_at
--   \d profils             -- no_show_count (default 0)
--   \d etats_des_lieux     -- contestation_expiree_at
--   \d irl_history         -- nouvelle table avec PK trimestre
--
-- Index UNIQUE check :
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'bail_invitations'
--      AND indexname = 'uniq_bail_invitations_pending_per_annonce';
--   -- doit retourner 1 ligne
--
-- Test fonctionnel race condition (sur DB de test) :
--   INSERT INTO bail_invitations(annonce_id, statut, ...) VALUES (1, 'pending', ...);
--   INSERT INTO bail_invitations(annonce_id, statut, ...) VALUES (1, 'pending', ...);
--   -- 2ᵉ INSERT doit ERROR : duplicate key value violates unique constraint
--
-- Test no-show :
--   UPDATE visites SET statut = 'no_show', no_show_partie = 'locataire' WHERE id = X;
--   UPDATE profils SET no_show_count = no_show_count + 1 WHERE email = '...';
--
-- Test irl_history (initial seed depuis hardcoded) :
--   INSERT INTO irl_history (trimestre, annee, trim_num, indice, publication_date)
--   VALUES ('T1 2026', 2026, 1, 145.66, 'Avril 2026');
--   -- doit fonctionner. ON CONFLICT (trimestre) DO NOTHING ensuite si re-run.
--
-- Smoke test côté app :
--   ✓ POST /api/bail/preavis avec motif='vente' + ventePrix → annonce.preavis_vente_prix posé
--   ✓ POST /api/visites/no-show → visites.no_show_* + profils.no_show_count incrémenté
--   ✓ Cron edl-contestation-retard → contestation_expiree_at posé
--   ✓ POST /api/bail/from-annonce 2 fois en parallèle → 1 ok + 1 duplicate=true
--   ✓ Cron scrape-irl-insee → irl_history.insert OK + email admin
