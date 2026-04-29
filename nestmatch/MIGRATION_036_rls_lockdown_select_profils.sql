-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 036 — RLS Lockdown SELECT phase 5 (profils only) — V29.C
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Paul / Claude (V29.C)
-- Date: 2026-04-29
-- Status: READY TO APPLY
--
-- ─── CONTEXTE ──────────────────────────────────────────────────────────────
--
-- Audit V12 + V22.1 finding CRITIQUE : la table `profils` contient
-- `dossier_docs` jsonb (CNI, fiches paie, revenus, garants — RGPD majeur).
-- La clé anon publique du bundle JS permettait jusqu'ici un SELECT *
-- de tous les profils → exfiltration de masse possible.
--
-- ─── PRÉREQUIS APPLIQUÉS V29.B ────────────────────────────────────────────
--
-- 20 sites client supabase.from("profils").select(...) migrés vers les
-- routes /api/profil/* (server-side, NextAuth gate, supabaseAdmin) :
--   - GET  /api/profil/me                — propre profil complet
--   - POST /api/profil/by-emails          — peer cols PUBLIC whitelist
--   - GET  /api/profil/candidat/[email]   — proprio→candidat (auth via msg)
--   - POST /api/proprietaire/candidates-dossiers — batch équivalent
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- Cette migration REVOKE SELECT anon UNIQUEMENT sur profils. Les autres
-- tables sensibles (messages, bail_signatures, edl_signatures, loyers,
-- notifications, users, bail_invitations, etats_des_lieux,
-- dossier_share_tokens, dossier_access_log) gardent SELECT temporairement
-- — V30+ migrera ces lectures vers des routes /api/* dédiées.

BEGIN;

-- profils : REVOKE SELECT (toutes les lectures via /api/profil/*)
-- INSERT/UPDATE/DELETE/TRUNCATE déjà revokes en migration 030/035.
REVOKE SELECT ON TABLE public.profils FROM anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SELECT privilege_type FROM information_schema.role_table_grants
-- WHERE grantee='anon' AND table_schema='public' AND table_name='profils';
--
-- Attendu : juste REFERENCES + TRIGGER metadata. Plus aucun SELECT/INSERT/
-- UPDATE/DELETE/TRUNCATE.
--
-- ─── SMOKE TESTS UI POST-APPLY ────────────────────────────────────────────
-- 1. /profil — chargement profil OK (fetch /api/profil/me)
-- 2. /dossier — chargement dossier_docs OK
-- 3. /annonces — score matching OK (peers profils via /api/profil/by-emails)
-- 4. /messages — peer info OK (telephone visible)
-- 5. /proprietaire/annonces/[id]/candidatures — dossiers candidates OK
-- 6. /carnet — locataires noms OK (by-emails public cols)
-- 7. Navbar — photo custom user OK
--
-- ─── ATTENDUE BREAK SI DEPLOIEMENT EN AVANCE ──────────────────────────────
-- Si le code V29.B n'est pas déployé sur Vercel quand la migration 036 est
-- appliquée : tous les sites client ferraillent (silent fail, profils
-- vides). Toujours déployer V29.B → puis appliquer 036.
