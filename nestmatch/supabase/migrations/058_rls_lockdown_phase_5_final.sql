-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 058 — RLS Phase 5 Lockdown SELECT messages (V65.1)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V65.1)
-- Date: 2026-05-04
-- Status: ✅ MIGRATION READY — APPLIQUER MAINTENANT
--
-- ─── PRÉREQUIS APPLIQUÉS V65.1 ──────────────────────────────────────────────
--
-- TOUS les sites client `supabase.from("messages")` migrés vers des routes
-- API server-side. Vérification : `grep -rn 'supabase.from("messages")'
-- app --include="*.tsx" --include="*.ts" | grep -v "/api/"` → 0 résultat.
--
-- Routes API ajoutées (V63 + V65.1) :
--   POST   /api/messages                        : insert générique
--   POST   /api/messages/candidature            : 1ᵉʳ contact locataire→proprio
--   POST   /api/messages/mark-read              : bulk update lu=true
--   DELETE /api/messages/[id]                   : suppression (ownership)
--   PATCH  /api/messages/[id]                   : édition contenu (5 min window)
--   GET    /api/messages/thread                 : load full conv
--   GET    /api/messages/all-mine               : tous mes messages (inbox+sent)
--   GET    /api/messages/unread-count           : badge Navbar
--   POST   /api/messages/delete-conversation    : bulk delete d'une conv
--   GET    /api/messages/last-by-prefix         : dernier message système (whitelist)
--   GET    /api/bail/card-payload               : load [BAIL_CARD] parsé
--   GET    /api/proprietaire/stats/messages-counts : counts funnel proprio
--   POST   /api/messages/event                  : déjà existant
--
-- Tous avec auth NextAuth + scope check (proprio/locataire de l'annonce).
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- REVOKE SELECT/INSERT/UPDATE/DELETE anon sur `messages` uniquement.
-- Les routes /api/messages/* écrivent via supabaseAdmin (service_role) qui
-- bypass RLS. Le grant authenticated reste actif (cf. usage NextAuth).

BEGIN;

REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.messages FROM anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── VÉRIFICATION POST-APPLY (manuelle) ───────────────────────────────────
--
--   SET ROLE anon;
--   SELECT COUNT(*) FROM messages;        -- should ERROR : permission denied
--   INSERT INTO messages(from_email, to_email, contenu) VALUES('a@b.fr','c@d.fr','test');
--                                         -- should ERROR : permission denied
--   RESET ROLE;
--
-- Smoke test côté app :
--   ✓ Navbar badge messages non lus
--   ✓ /messages charge la liste des conversations
--   ✓ Envoi message dans une conv → s'affiche
--   ✓ Suppression conv → disparaît
--   ✓ Suppression message individuel → disparaît
--   ✓ Mark-read en cliquant sur conv non lue
--   ✓ /annonces/[id] ContactButton → message envoyé apparaît côté proprio
--   ✓ /mon-logement → load bail + loyers + EDL
--   ✓ /proprietaire dashboard → counts messages reçus
--   ✓ /proprietaire/stats → funnel candidatures + dossiers
--
-- ─── ÉTAT RLS PHASE 5 APRÈS MIGRATION 058 ─────────────────────────────────
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
--   ✅ messages               (V65.1, mig 058) ⬅ CETTE MIGRATION
--   ⏳ loyers                 (V65.2, mig 059)
--   ⏳ etats_des_lieux        (V65.2, mig 059)
--
--   10/12 — appliquer 059 ensuite pour 100%.
