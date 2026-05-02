-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 053 — RLS Phase 5 Lockdown SELECT (Part B — bail/edl signatures)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V55.1b)
-- Date: 2026-04-30
-- Status: READY TO APPLY
--
-- ─── PRÉREQUIS APPLIQUÉS V55.1b ────────────────────────────────────────────
--
-- 6 sites client `supabase.from("bail_signatures")` migrés vers
-- /api/bail/signatures :
--   - app/messages/page.tsx                      (PDF download du bail)
--   - app/mon-logement/page.tsx ×2                (load + onSigned refresh)
--   - app/proprietaire/bail/[id]/page.tsx ×2      (loadBien + bail download)
--   - app/proprietaire/stats/page.tsx             (signataires dans funnel)
--
-- 4 sites client `supabase.from("edl_signatures")` migrés vers
-- /api/edl/signatures :
--   - app/edl/consulter/[edlId]/page.tsx ×3       (load + onSignedEdl + PDF)
--   - app/messages/page.tsx                       (batch fetch via edl_id=X,Y,Z)
--
-- Routes ajoutées :
-- - GET /api/bail/signatures?annonce_id=X[&include_png=true]
-- - GET /api/edl/signatures?edl_id=X[,Y,Z][&include_png=true]
--
-- Toutes 2 : auth NextAuth + scope check (proprio OU locataire de
-- l'annonce parente uniquement). 401/403/404 selon le cas.
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- REVOKE SELECT anon sur bail_signatures + edl_signatures uniquement.
-- INSERT/UPDATE inchangés (les /api/bail/signer + /api/edl/signer écrivent
-- via supabaseAdmin et n'ont pas besoin du grant anon).

BEGIN;

REVOKE SELECT ON TABLE public.bail_signatures FROM anon;
REVOKE SELECT ON TABLE public.edl_signatures FROM anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Vérification post-apply (à exécuter manuellement) :
-- SET ROLE anon;
-- SELECT COUNT(*) FROM bail_signatures;  -- should ERROR : permission denied
-- SELECT COUNT(*) FROM edl_signatures;   -- should ERROR
-- RESET ROLE;
--
-- État RLS Phase 5 après migration 053 :
--   ✅ profils                (V29.C, mig 036)
--   ✅ users                  (V55.1a, mig 051)
--   ✅ dossier_share_tokens   (V55.1a, mig 051)
--   ✅ dossier_access_log     (V55.1a, mig 051)
--   ✅ bail_invitations       (V55.1a, mig 051)
--   ✅ bail_avenants          (V55.1a, mig 051)
--   ✅ notifications          (V55.1a, mig 051)
--   ✅ bail_signatures        (V55.1b, mig 053)
--   ✅ edl_signatures         (V55.1b, mig 053)
--   ⏳ messages               (DÉFÉRÉ V55.1c — 14 sites client à migrer)
--   ⏳ loyers                 (DÉFÉRÉ V55.1c — 5 sites)
--   ⏳ etats_des_lieux        (DÉFÉRÉ V55.1c — 5 sites)
--
-- 9/12 tables sécurisées. 3 restent à fermer (V55.1c — chantier ~6h).
