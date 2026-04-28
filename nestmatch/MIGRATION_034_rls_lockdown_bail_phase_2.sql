-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 034 — RLS Lockdown bail tables Phase 2 (V24.1)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V24.1)
-- Date: 2026-04-29
-- Status: READY TO APPLY
--
-- Continue le lockdown initié en migration 033. Phase 2 = REVOKE
-- INSERT/UPDATE/DELETE sur les 3 tables qui restaient ouvertes :
--   - etats_des_lieux
--   - edl_signatures
--   - loyers
-- (TRUNCATE déjà revoked en 030).
--
-- Prérequis : tous les writes client direct ont été migrés vers des
-- routes /api/* server-side (V24.1 commit) :
--   - /api/edl/save (etats_des_lieux upsert)
--   - /api/edl/signer (edl_signatures insert) — déjà existant
--   - /api/loyers/save (loyers declare/confirm/upsert)
--   - /api/loyers/quittance (génération PDF)
--
-- SELECT reste ouvert pour anon (clients lisent encore /mes-documents,
-- /mes-quittances, /mon-logement, /proprietaire, /proprietaire/stats).
-- Phase 5 (V25+) fermera la lecture quand RLS user-aware sera en place.

BEGIN;

-- 1. etats_des_lieux : REVOKE writes
REVOKE INSERT ON TABLE public.etats_des_lieux FROM anon;
REVOKE UPDATE ON TABLE public.etats_des_lieux FROM anon;
REVOKE DELETE ON TABLE public.etats_des_lieux FROM anon;

-- 2. edl_signatures : REVOKE writes (signatures via /api/edl/signer)
REVOKE INSERT ON TABLE public.edl_signatures FROM anon;
REVOKE UPDATE ON TABLE public.edl_signatures FROM anon;
REVOKE DELETE ON TABLE public.edl_signatures FROM anon;

-- 3. loyers : REVOKE writes (via /api/loyers/save)
REVOKE INSERT ON TABLE public.loyers FROM anon;
REVOKE UPDATE ON TABLE public.loyers FROM anon;
REVOKE DELETE ON TABLE public.loyers FROM anon;

-- NOTIFY PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SELECT grantee, privilege_type, table_name
-- FROM information_schema.role_table_grants
-- WHERE grantee = 'anon' AND table_schema = 'public'
--   AND table_name IN ('etats_des_lieux', 'edl_signatures', 'loyers')
-- ORDER BY table_name, privilege_type;
--
-- Attendu :
--   etats_des_lieux : SELECT only
--   edl_signatures  : SELECT only
--   loyers          : SELECT only
--
-- Smoke tests UI :
--   1. /proprietaire/edl/[id] — création/edit EDL (via /api/edl/save) OK
--   2. /edl/consulter/[edlId] — contestation locataire (via /api/edl/save) OK
--   3. Locataire signe EDL (via /api/edl/signer existant) OK
--   4. /mon-logement — déclaration loyer (via /api/loyers/save mode declare) OK
--   5. /proprietaire — confirmation loyer (via /api/loyers/save mode confirm) OK
--   6. /proprietaire/stats — upsert + confirm (via /api/loyers/save) OK
