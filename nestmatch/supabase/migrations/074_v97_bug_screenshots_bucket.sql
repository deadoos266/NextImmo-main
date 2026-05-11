-- V97.10 — Bucket Supabase Storage + RLS policy pour les screenshots de bug reports
--
-- Le browser uploade les screenshots via la clé anon (lib/supabase.ts).
-- Sans une policy INSERT sur storage.objects pour ce bucket, l'upload renvoie
-- 403 row-level security violation. Le BugReportButton avale silencieusement
-- l'erreur (console.warn) et envoie le bug report SANS screenshot — l'user
-- voit "Bug signalé. Merci !" alors que rien n'a été capturé.
--
-- Pattern repris de 005_storage_bucket_policies.sql (annonces-photos) et
-- 023_baux_rls_fix.sql (baux). NextAuth n'expose pas de JWT Supabase Auth,
-- donc auth.jwt() = null côté anon. La policy autorise INSERT pour
-- anon/authenticated, restreint à ce bucket spécifique.
--
-- SELECT public est volontairement INTERDIT : les admins lisent via signed
-- URL générée server-side par supabaseAdmin (cf /admin/bugs page + /api/admin/bugs).

BEGIN;

-- 1. Idempotent : si le bucket existe déjà (créé via Management API), no-op.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bug-screenshots',
  'bug-screenshots',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 2. Drop policies préexistantes (idempotence relance)
DROP POLICY IF EXISTS "bug_screenshots_insert" ON storage.objects;
DROP POLICY IF EXISTS "bug_screenshots_select_admin" ON storage.objects;

-- 3. INSERT — autorisé pour anon ET authenticated.
--    Le widget BugReportButton est utilisé par tous les users connectés ;
--    le check d'auth applicatif (NextAuth) se fait dans /api/bugs/report
--    avant qu'on stocke la row user_bug_reports. Le screenshot est juste
--    un fichier orphelin sans la row, donc pas un risque de leak.
CREATE POLICY "bug_screenshots_insert" ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'bug-screenshots');

-- 4. SELECT — INTERDIT côté client. Les admins lisent via signed URL
--    générée server-side par supabaseAdmin (service_role bypass RLS).
--    Aucune policy SELECT créée = aucun accès direct côté browser.

-- 5. UPDATE/DELETE — INTERDIT côté client. Les screenshots sont write-once.
--    Le ménage des vieux fichiers (lifecycle) sera fait par un cron admin
--    plus tard si besoin (V97.11+).

COMMIT;
