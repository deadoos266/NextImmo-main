-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 051 — RLS Phase 5 Lockdown SELECT (Part A — 6 safe tables)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V55.1a)
-- Date: 2026-04-30
-- Status: READY TO APPLY
--
-- ─── CONTEXTE ──────────────────────────────────────────────────────────────
--
-- V29 (mig 036) avait fermé SELECT anon sur `profils` UNIQUEMENT.
-- 11 tables sensibles restaient lisibles via la clé anon publique du JS bundle.
-- V55.1 corrige progressivement.
--
-- Cette migration (Part A) couvre les 6 tables avec ZÉRO ou très peu de
-- client reads — donc safe à REVOKE sans risque de 401 généralisé :
--   1. users               (2 client reads → migrés V55.1a)
--   2. dossier_share_tokens (1 read → DÉJÀ server-side via supabaseAdmin)
--   3. dossier_access_log  (0 client reads — uniquement /api/dossier-partage)
--   4. bail_invitations    (0 client reads — uniquement /api/bail/from-annonce + /api/bail/importer)
--   5. bail_avenants       (0 client reads — uniquement /api/bail/avenant/*)
--   6. notifications       (0 client reads — uniquement lib/notificationsClient via /api)
--
-- Les 5 tables restantes (messages, loyers, etats_des_lieux,
-- bail_signatures, edl_signatures) nécessitent la migration de 27+ sites
-- client → V55.1b séparé (commits dédiés par table).
--
-- ─── INSERT/UPDATE/DELETE ────────────────────────────────────────────────
--
-- Pour les tables où le client doit pouvoir écrire (ex : notifications.lu
-- update via client), on garde GRANT INSERT/UPDATE/DELETE selon les besoins.
-- Cette migration ne touche QUE le SELECT anon.

BEGIN;

REVOKE SELECT ON TABLE public.users FROM anon;
REVOKE SELECT ON TABLE public.dossier_share_tokens FROM anon;
REVOKE SELECT ON TABLE public.dossier_access_log FROM anon;
REVOKE SELECT ON TABLE public.bail_invitations FROM anon;
REVOKE SELECT ON TABLE public.bail_avenants FROM anon;
REVOKE SELECT ON TABLE public.notifications FROM anon;

-- Reload PostgREST pour que le REVOKE soit effectif immédiatement.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Vérification post-apply (à exécuter manuellement) :
-- SET ROLE anon;
-- SELECT COUNT(*) FROM users;                  -- should ERROR : permission denied
-- SELECT COUNT(*) FROM dossier_share_tokens;   -- should ERROR
-- SELECT COUNT(*) FROM bail_invitations;       -- should ERROR
-- RESET ROLE;
