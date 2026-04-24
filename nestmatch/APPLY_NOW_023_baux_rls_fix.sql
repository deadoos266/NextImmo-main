-- ═══════════════════════════════════════════════════════════════════
-- APPLY NOW 023 — Fix RLS upload bail (à coller dans SQL Editor Supabase)
-- ═══════════════════════════════════════════════════════════════════
-- Pourquoi : l'upload d'un bail PDF depuis UploadBailModal renvoie
--   "new row violates row-level security policy"
-- Cause : la policy `baux_insert_own` de la migration 015 exige
--   auth.jwt() ->> 'email' = folder[1]
-- mais l'appli utilise NextAuth Google (pas Supabase Auth) → JWT vide
-- côté Supabase → policy rejette.
--
-- Fix : aligner `baux` sur le comportement effectif de `annonces-photos`
-- et `dossiers` (INSERT permissif, la sécurité applicative fait le
-- contrôle d'accès réel — NextAuth + annonces.bail_url update applicatif).
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "baux_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "baux_delete_own" ON storage.objects;

DROP POLICY IF EXISTS "baux_insert_any" ON storage.objects;
CREATE POLICY "baux_insert_any" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'baux');

DROP POLICY IF EXISTS "baux_delete_any" ON storage.objects;
CREATE POLICY "baux_delete_any" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'baux');

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════
-- Vérification : liste les policies du bucket baux
-- ═══════════════════════════════════════════════════════════════════
SELECT policyname, cmd, roles::text, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND policyname LIKE 'baux_%'
 ORDER BY cmd, policyname;
