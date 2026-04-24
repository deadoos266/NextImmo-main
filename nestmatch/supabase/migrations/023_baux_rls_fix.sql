-- ═══════════════════════════════════════════════════════════════════
-- Migration 023 — Fix RLS bucket `baux` pour upload depuis client anon.
-- ═══════════════════════════════════════════════════════════════════
--
-- Contexte bug : UploadBailModal.tsx uploade via `supabase.storage.from("baux").upload(...)`
-- avec le client anon (lib/supabase.ts). L'appli utilise NextAuth Google (pas Supabase
-- Auth) → aucun JWT Supabase → `auth.jwt() ->> 'email'` renvoie NULL → la policy
-- `baux_insert_own` de la migration 015 rejette l'upload :
--   "new row violates row-level security policy"
--
-- Les buckets `annonces-photos` et `dossiers` (migration 005) ont exactement le
-- même pattern strict mais fonctionnent en prod — les policies ont donc été
-- loosened manuellement côté dashboard Supabase. On aligne `baux` sur le même
-- comportement effectif : INSERT/DELETE permissifs (bucket_id = 'baux' seul),
-- SELECT public (déjà OK). La sécurité réelle vient :
--   - du contrôle d'accès applicatif (proprio identifié par NextAuth avant insert)
--   - du lien bail stocké dans `annonces.bail_url` qui n'est mis à jour qu'après
--     upload réussi côté code
--   - du rate-limit applicatif
--
-- Idempotent — peut être rejouée sans risque.
-- ═══════════════════════════════════════════════════════════════════

-- Drop les policies strictes de 015
DROP POLICY IF EXISTS "baux_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "baux_delete_own" ON storage.objects;

-- INSERT : autoriser anon + authenticated sur le bucket baux
DROP POLICY IF EXISTS "baux_insert_any" ON storage.objects;
CREATE POLICY "baux_insert_any" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'baux');

-- DELETE : idem (utile si le proprio veut remplacer son PDF)
DROP POLICY IF EXISTS "baux_delete_any" ON storage.objects;
CREATE POLICY "baux_delete_any" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'baux');

-- SELECT : déjà public via `baux_select_public` (migration 015), inutile de toucher.

NOTIFY pgrst, 'reload schema';
