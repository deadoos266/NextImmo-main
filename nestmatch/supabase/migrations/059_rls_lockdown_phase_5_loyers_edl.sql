-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 059 — RLS Phase 5 FINAL : loyers + etats_des_lieux (V65.2)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V65.2)
-- Date: 2026-05-04
-- Status: ✅ MIGRATION READY — APPLIQUER après 058
--
-- ─── PRÉREQUIS APPLIQUÉS V65.2 ──────────────────────────────────────────────
--
-- TOUS les sites client `supabase.from("loyers"|"etats_des_lieux")` migrés
-- vers routes API server-side. Vérification :
--   grep -rn 'supabase.from("loyers")\|supabase.from("etats_des_lieux")'
--     app --include="*.tsx" --include="*.ts" | grep -v "/api/"
--   → 0 résultat
--
-- Routes API ajoutées :
-- LOYERS :
--   POST  /api/loyers/save        : déjà existant (declare/confirm/upsert)
--   GET   /api/loyers/list        : annonce_id|mine=locataire|mine=proprio
--   POST  /api/loyers/quittance   : déjà existant
--
-- ETATS_DES_LIEUX :
--   POST  /api/edl/save           : déjà existant
--   POST  /api/edl/signer         : déjà existant
--   GET   /api/edl/signatures     : déjà existant
--   POST  /api/edl/photo          : déjà existant
--   GET   /api/edl/[id]           : déjà existant
--   GET   /api/edl/by-annonce     : last EDL d'une annonce + clone pieces
--   GET   /api/edl/by-annonces    : batch (proprio dashboard)
--   GET   /api/edl/has-mine       : flag locataire pour /mes-documents
--
-- Toutes avec auth NextAuth + scope check (proprio/locataire de l'annonce).
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- REVOKE SELECT anon sur `loyers` + `etats_des_lieux`.
-- Les writes (INSERT/UPDATE) passent toutes par /api/* qui utilisent
-- supabaseAdmin → bypass RLS. On peut REVOKE INSERT/UPDATE/DELETE aussi.

BEGIN;

-- LOYERS
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.loyers FROM anon;

-- ETATS_DES_LIEUX
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.etats_des_lieux FROM anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── VÉRIFICATION POST-APPLY (manuelle) ───────────────────────────────────
--
--   SET ROLE anon;
--   SELECT COUNT(*) FROM loyers;            -- should ERROR : permission denied
--   SELECT COUNT(*) FROM etats_des_lieux;   -- should ERROR
--   INSERT INTO loyers(annonce_id, mois, montant) VALUES(1, '2026-05', 800);
--                                            -- should ERROR
--   RESET ROLE;
--
-- Smoke test côté app :
--   ✓ /mes-documents → quittances locataire affichées
--   ✓ /mon-logement → calendrier loyers + EDLs
--   ✓ /proprietaire dashboard → cards EDL par bien
--   ✓ /proprietaire/stats → funnel + tableau loyers
--   ✓ /proprietaire/edl/:id → load EDL existant ou clone pieces entrée→sortie
--   ✓ Locataire déclare paiement → loyer apparaît
--   ✓ Proprio confirme → quittance émise
--   ✓ EDL entrée puis sortie → comparaison item par item
--
-- ─── ÉTAT RLS PHASE 5 APRÈS MIGRATION 059 ─────────────────────────────────
--
--   ✅ profils                (V29.C, mig 036)
--   ✅ users                  (V55.1a, mig 051)
--   ✅ dossier_share_tokens   (V55.1a, mig 051)
--   ✅ dossier_access_log     (V55.1a, mig 051)
--   ✅ bail_invitations       (V55.1a, mig 051)
--   ✅ bail_avenants          (V55.1a, mig 051)
--   ✅ notifications          (V55.1a, mig 051)
--   ✅ bail_signatures        (V55.1b, mig 053)
--   ✅ edl_signatures         (V55.1b, mig 053)
--   ✅ messages               (V65.1, mig 058)
--   ✅ loyers                 (V65.2, mig 059) ⬅ CETTE MIGRATION
--   ✅ etats_des_lieux        (V65.2, mig 059) ⬅
--
--   12/12 — RLS Phase 5 100% COMPLET. KeyMatch full lockdown anon.
