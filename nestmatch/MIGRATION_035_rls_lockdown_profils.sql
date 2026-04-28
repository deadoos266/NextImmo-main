-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 035 — RLS Lockdown profils writes (V24.3)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V24.3)
-- Date: 2026-04-29
-- Status: READY TO APPLY
--
-- ─── CONTEXTE ──────────────────────────────────────────────────────────────
--
-- Audit V12 Étape A (docs/RLS_AUDIT.md) finding CRITIQUE :
-- "profils contient dossier_docs jsonb (CNI, fiches paie, revenus, garants).
--  17 sites client utilisent supabase.from('profils').upsert/update/insert
--  avec la clé anon publique du bundle. Un attaquant peut écraser le
--  profil de n'importe quel user."
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- Tous les sites client ont été migrés vers /api/profil/save (server-side
-- avec NextAuth + email forcé = session.user.email). Cette migration
-- REVOKE INSERT/UPDATE/DELETE/TRUNCATE anon sur public.profils.
--
-- SELECT reste OUVERT — clients lisent encore /profil, /dossier, /annonces,
-- /messages, /onboarding, etc. Phase 5 (V25+) fermera SELECT quand RLS
-- user-aware (NextAuth ↔ Supabase Auth sync) en place.
--
-- ─── PRÉREQUIS APPLIQUÉS V24.3 ─────────────────────────────────────────────
--
-- Sites migrés vers /api/profil/save :
-- 1. /dossier/page.tsx (upload doc + sauvegarder)
-- 2. /onboarding/page.tsx (initial profil)
-- 3. /parametres/OngletCompte.tsx (notif prefs)
-- 4. /parametres/OngletProfil.tsx (telephone + bio)
-- 5. /profil/creer/page.tsx (creation initiale)
-- 6. /profil/page.tsx (sauvegarder + saveSection + applyUndo + secondaires)
-- 7. /proprietaire/activer/page.tsx (is_proprietaire flag)
-- 8. /proprietaire/ajouter/page.tsx (is_proprietaire post-publish)
--
-- ─── ROLLBACK ──────────────────────────────────────────────────────────────
--
-- En cas de problème :
--   GRANT INSERT, UPDATE, DELETE ON TABLE public.profils TO anon;

BEGIN;

-- profils : REVOKE writes (toutes les écritures via /api/profil/save)
-- TRUNCATE déjà revoked en migration 030.
REVOKE INSERT ON TABLE public.profils FROM anon;
REVOKE UPDATE ON TABLE public.profils FROM anon;
REVOKE DELETE ON TABLE public.profils FROM anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SELECT grantee, privilege_type, table_name
-- FROM information_schema.role_table_grants
-- WHERE grantee = 'anon' AND table_schema = 'public' AND table_name = 'profils'
-- ORDER BY privilege_type;
--
-- Attendu : SELECT only (REFERENCES + TRIGGER metadata visibles aussi).
--
-- Smoke tests UI :
--   1. /onboarding première fois → profil créé via /api/profil/save ✓
--   2. /profil sauvegarde tout → /api/profil/save ✓
--   3. /profil sauvegarder section (criteres, equipements, ...) ✓
--   4. /profil/creer wizard initial ✓
--   5. /dossier upload doc + sauvegarder ✓
--   6. /parametres telephone + bio + notif prefs ✓
--   7. /proprietaire/activer "Devenir proprio" ✓
--   8. /proprietaire/ajouter step 7 publie → flag is_proprietaire ✓
