-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 030 — RLS Lockdown Étape 1 (Conservative)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V12 Étape C)
-- Date: 2026-04-28
-- Status: READY TO APPLY (conservative scope, see WARNING below)
--
-- ─── CONTEXTE ──────────────────────────────────────────────────────────────
--
-- Audit V12 Étape A (cf docs/RLS_AUDIT.md) : 184 ops sensibles sur 14 tables
-- exposées au client anon. Vulnérabilités majeures dans /admin/page.tsx
-- corrigées en Étape B Phase 1 (migration vers /api/admin/* server-side).
--
-- ─── SCOPE DE CETTE MIGRATION ──────────────────────────────────────────────
--
-- Cette migration applique UNIQUEMENT les REVOKE qui sont safe APRÈS
-- l'Étape B Phase 1 (admin migration). Elle NE CASSE PAS la prod parce
-- que :
--
-- 1. TRUNCATE — anon ne l'utilise jamais nulle part. Safe partout.
-- 2. DELETE sur profils + users — utilisé UNIQUEMENT par /admin/page.tsx,
--    qui passe désormais par /api/admin/users (supabaseAdmin). Safe.
-- 3. UPDATE sur users (is_admin / is_banned) — admin-only, migré. Safe.
-- 4. UPDATE sur annonces.is_test — admin-only, migré vers
--    /api/admin/annonces. Safe.
--
-- Les écritures normales (locataire/propriétaire saving leur profil,
-- envoyant des messages, etc.) RESTENT autorisées car ces flux n'ont pas
-- encore été migrés (ce sera Phase 2/3/4 du chantier B).
--
-- ─── WARNING ─────────────────────────────────────────────────────────────
--
-- Cette migration NE LOCKDOWN PAS encore les SELECT sur profils/messages.
-- Tant que le client anon les lit pour afficher /dossier, /profil, /messages,
-- on ne peut pas REVOKE SELECT sans casser la prod. Phase 2/3 doivent migrer
-- ces lectures vers des routes server-side avant un REVOKE SELECT global.
--
-- En attendant, le risque résiduel c'est : un attaquant ayant la clé anon
-- peut lire profils/messages/etc. La filtration email = session.user.email
-- est implémentée côté client mais NON enforced côté DB → un attaquant
-- forge une requête sans filtre et tire tout. Phase 2/3 pour fermer ça.
--
-- ─── COMMENT APPLIQUER ─────────────────────────────────────────────────────
--
-- Option A (RECOMMANDÉ) : MCP Supabase apply_migration depuis Claude.
--   Le user lance : "applique la migration 030 stp"
--
-- Option B : SQL Editor Supabase Studio (copier-coller).
--   ⚠ Vérifier qu'on est sur le bon projet (prod) avant de coller.
--
-- ─── ROLLBACK ──────────────────────────────────────────────────────────────
--
-- En cas de problème, annuler avec :
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.<table> TO anon;
-- (réinverser pour chaque REVOKE).

BEGIN;

-- ─── 1. REVOKE TRUNCATE — totalement sûr partout ─────────────────────────
-- Aucun client n'utilise jamais TRUNCATE. Anon n'a pas besoin de cette
-- permission, c'est un legacy GRANT à enlever sur toutes les tables sensibles.
REVOKE TRUNCATE ON TABLE public.profils FROM anon;
REVOKE TRUNCATE ON TABLE public.messages FROM anon;
REVOKE TRUNCATE ON TABLE public.users FROM anon;
REVOKE TRUNCATE ON TABLE public.dossier_share_tokens FROM anon;
REVOKE TRUNCATE ON TABLE public.dossier_access_log FROM anon;
REVOKE TRUNCATE ON TABLE public.bail_invitations FROM anon;
REVOKE TRUNCATE ON TABLE public.bail_signatures FROM anon;
REVOKE TRUNCATE ON TABLE public.etats_des_lieux FROM anon;
REVOKE TRUNCATE ON TABLE public.edl_signatures FROM anon;
REVOKE TRUNCATE ON TABLE public.loyers FROM anon;
REVOKE TRUNCATE ON TABLE public.notifications FROM anon;
REVOKE TRUNCATE ON TABLE public.visites FROM anon;
REVOKE TRUNCATE ON TABLE public.conversation_preferences FROM anon;
REVOKE TRUNCATE ON TABLE public.carnet_entretien FROM anon;
REVOKE TRUNCATE ON TABLE public.clics_annonces FROM anon;
REVOKE TRUNCATE ON TABLE public.annonces FROM anon;

-- ─── 2. REVOKE DELETE sur tables admin-only ───────────────────────────────
-- profils + users : seuls /admin/page.tsx les supprimait, désormais via
-- /api/admin/users (supabaseAdmin). Plus de besoin du grant client.
REVOKE DELETE ON TABLE public.profils FROM anon;
REVOKE DELETE ON TABLE public.users FROM anon;

-- ─── 3. REVOKE UPDATE sur colonnes/tables admin-only ────────────────────
-- users.is_admin et users.is_banned : seuls /admin/page.tsx + auth flow
-- les modifiaient. Auth flow (register/email-verify) passe par
-- /api/auth/* (supabaseAdmin). Admin flow migré /api/admin/users.
-- → On REVOKE l'UPDATE entier sur public.users côté anon.
REVOKE UPDATE ON TABLE public.users FROM anon;

-- annonces.is_test : seul /admin/page.tsx flagait test. Migré
-- /api/admin/annonces. Mais les propriétaires UPDATE leur annonce
-- (via /api/proprietaire/* OU client direct selon route — l'audit montre
-- des UPDATE clients côté proprietaire/page.tsx + modifier/[id]/page.tsx).
-- → On NE REVOKE PAS UPDATE sur annonces dans cette migration. Phase 2.

-- ─── 4. NOTIFY PostgREST pour rafraîchir le schéma ─────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLY (à exécuter manuellement après la migration)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ces requêtes confirment que les permissions ont été retirées comme attendu :
--
-- SELECT grantee, privilege_type, table_name
-- FROM information_schema.role_table_grants
-- WHERE grantee = 'anon'
--   AND table_schema = 'public'
--   AND table_name IN ('profils', 'users', 'messages', 'visites', 'loyers',
--                      'etats_des_lieux', 'carnet_entretien', 'annonces')
-- ORDER BY table_name, privilege_type;
--
-- Attendu :
--  - profils : SELECT, INSERT, UPDATE  (DELETE + TRUNCATE retirés)
--  - users   : SELECT                  (INSERT/UPDATE/DELETE/TRUNCATE retirés)
--  - messages: SELECT, INSERT, UPDATE, DELETE  (TRUNCATE retiré)
--  - autres  : SELECT, INSERT, UPDATE, DELETE  (TRUNCATE retiré)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PROCHAINES ÉTAPES (NON DANS CETTE MIGRATION)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Phase 2 : Migrer profil mutations vers /api/profil/save → REVOKE INSERT/UPDATE
--           sur profils côté anon.
-- Phase 3 : Migrer messages writes vers /api/messages/* → REVOKE INSERT/UPDATE
--           sur messages côté anon.
-- Phase 4 : Migrer SELECT lectures privées (profils, messages, dossier_*) vers
--           routes server-side → REVOKE SELECT sur ces tables côté anon.
-- Phase 5 : Activer RLS enforcement (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
--           sur toutes les tables sensibles + policies user-aware via NextAuth
--           → Supabase Auth sync (chantier majeur).
--
