-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 060 — REVOKE INSERT anon sur `annonces` (V69.1f)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V69.1f)
-- Date: 2026-05-05
-- Status: ✅ MIGRATION READY — APPLIQUER après déploiement V69.1f
--
-- ─── PRÉREQUIS APPLIQUÉS V69.1f ─────────────────────────────────────────────
--
-- TOUS les sites client `supabase.from("annonces").insert(...)` migrés vers
-- la route server-side `/api/annonces/create`.
--
-- Vérification : `grep -rn 'supabase.from(\"annonces\").insert\|supabase\.from\(\"annonces\"\).update' app --include="*.tsx"`
-- Le seul site INSERT restant doit être... aucun. Les UPDATE peuvent rester
-- pour l'instant (modifier annonce, terminer-bail) mais Phase 5 V70+ les
-- migrera aussi.
--
-- Route /api/annonces/create :
--   - NextAuth requis, proprietaire_email = session strictement
--   - is_test forcé à false (anti-tricherie V68)
--   - Rate-limit 10/h/user + 30/h/IP
--   - Validation Zod minimale + whitelist colonnes + 3 fallbacks legacy
--   - Upsert profils.is_proprietaire=true au succès
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- REVOKE INSERT anon sur `annonces` UNIQUEMENT. SELECT et UPDATE restent
-- accessibles anon (lecture publique des fiches + UPDATE par owner via
-- l'app, RLS Phase 5 V65+ les ferme progressivement).

BEGIN;

REVOKE INSERT ON TABLE public.annonces FROM anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── VÉRIFICATION POST-APPLY (manuelle) ───────────────────────────────────
--
--   SET ROLE anon;
--   INSERT INTO annonces(titre, ville, prix, proprietaire_email)
--     VALUES('Test', 'Paris', 800, 'a@b.fr');
--   -- should ERROR : permission denied for table annonces
--   RESET ROLE;
--
-- Smoke test côté app :
--   ✓ /proprietaire/ajouter → wizard 7 steps → submit → annonce créée
--   ✓ /proprietaire dashboard → annonce apparaît dans "Mes biens"
--   ✓ /annonces → annonce visible en liste publique (SELECT anon OK)
--   ✓ Bypass curl direct → 401 ou 403
--   ✓ Tentative is_test=true côté client → server force false
--
-- ─── ÉTAT RLS PHASE 5+ APRÈS MIGRATION 060 ────────────────────────────────
--
--   ✅ profils, users, dossier_*, bail_*, edl_*, notifications,
--      messages, loyers, etats_des_lieux (mig 036/051/053/058/059)
--   🔒 annonces : INSERT anon révoqué (mig 060)
--      SELECT/UPDATE/DELETE anon : encore actifs (lecture publique
--      + update via app/UPDATE direct dans certaines pages — V70+)
--
-- Si besoin de fermer aussi UPDATE anon plus tard, créer migration 062
-- après avoir migré les sites client UPDATE (modifier annonce, etc.).
