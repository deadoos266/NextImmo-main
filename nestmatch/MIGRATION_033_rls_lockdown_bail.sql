-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 033 — RLS Lockdown bail tables (V23.5)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V23.5)
-- Date: 2026-04-29
-- Status: READY TO APPLY (conservative scope)
--
-- ─── CONTEXTE ──────────────────────────────────────────────────────────────
--
-- Audit V22.1 (docs/AUDIT_FLOW_BAIL.md) finding HIGH #3 :
-- "RLS off sur bail_invitations + bail_signatures + edl_signatures +
--  loyers + etats_des_lieux. Anon peut INSERT/UPDATE → forge possible."
--
-- ─── SCOPE CONSERVATEUR ────────────────────────────────────────────────────
--
-- Cette migration N'APPLIQUE PAS le full lockdown des 5 tables — certains
-- clients lisent/écrivent encore directement (etats_des_lieux, edl_signatures,
-- loyers via /edl/consulter, /proprietaire/page.tsx, /proprietaire/stats,
-- /mon-logement, /mes-documents). REVOKE SELECT/INSERT/UPDATE casserait ces
-- pages immédiatement.
--
-- Phase 1 V23.5 = REVOKE uniquement ce qui est 100% safe :
--   1. bail_invitations : REVOKE SELECT + INSERT + UPDATE + DELETE
--      Aucun client app ne touche cette table directement (vérifié grep).
--      Toutes les opérations passent par /api/bail/* (supabaseAdmin).
--   2. bail_signatures : REVOKE INSERT + UPDATE + DELETE
--      Clients font UNIQUEMENT du SELECT (vérifié grep). Les insert/update
--      passent par /api/bail/signer (supabaseAdmin). On garde SELECT pour
--      les pages /messages, /mon-logement, /proprietaire/bail/[id],
--      /proprietaire/stats qui affichent l'état de signature.
--
-- Phase 2 (à venir, V24+) :
--   - Migrer les reads de etats_des_lieux + edl_signatures + loyers vers
--     /api/edl/* + /api/loyers/* (server-side avec supabaseAdmin).
--   - Une fois TOUS les call-sites client migrés, REVOKE complet possible.
--
-- ─── COMMENT APPLIQUER ─────────────────────────────────────────────────────
--
-- MCP Supabase apply_migration depuis Claude :
--   Le user lance : "applique la migration 033 stp"
--
-- ─── ROLLBACK ──────────────────────────────────────────────────────────────
--
-- En cas de problème :
--   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bail_invitations TO anon;
--   GRANT INSERT, UPDATE, DELETE ON TABLE public.bail_signatures TO anon;

BEGIN;

-- ─── 1. bail_invitations : lockdown complet ────────────────────────────
-- Aucun client n'utilise cette table directement. Tout passe par
-- /api/bail/importer, /api/bail/from-annonce, /api/bail/accepter,
-- /api/bail/refuser (tous server-side avec supabaseAdmin).
REVOKE SELECT ON TABLE public.bail_invitations FROM anon;
REVOKE INSERT ON TABLE public.bail_invitations FROM anon;
REVOKE UPDATE ON TABLE public.bail_invitations FROM anon;
REVOKE DELETE ON TABLE public.bail_invitations FROM anon;

-- ─── 2. bail_signatures : lockdown writes ──────────────────────────────
-- Clients SELECT-only (messages, mon-logement, proprietaire/bail/[id],
-- proprietaire/stats). Writes passent par /api/bail/signer.
REVOKE INSERT ON TABLE public.bail_signatures FROM anon;
REVOKE UPDATE ON TABLE public.bail_signatures FROM anon;
REVOKE DELETE ON TABLE public.bail_signatures FROM anon;

-- ─── 3. NOTIFY PostgREST ───────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SELECT grantee, privilege_type, table_name
-- FROM information_schema.role_table_grants
-- WHERE grantee = 'anon' AND table_schema = 'public'
--   AND table_name IN ('bail_invitations', 'bail_signatures')
-- ORDER BY table_name, privilege_type;
--
-- Attendu :
--   bail_invitations : (vide — anon n'a plus aucune permission)
--   bail_signatures  : SELECT seulement
--
-- Smoke tests post-apply (UI) :
--   1. Locataire reçoit invitation, clique le lien /bail-invitation/[token]
--      → la page doit toujours charger (utilise /api/bail/accepter).
--   2. Locataire signe via BailSignatureModal → /api/bail/signer.
--      → Doit fonctionner (server uses supabaseAdmin).
--   3. Proprio vue /proprietaire/bail/[id] doit afficher les signatures
--      (clients SELECT bail_signatures = OK, conservé).
--   4. Proprio publie un bien "loué" via wizard step 7 :
--      → annonce créée, /api/bail/from-annonce fire, invitation créée,
--        email locataire envoyé (server uses supabaseAdmin).
--   5. Wizard /proprietaire/bail/importer : flow standard préservé.
