-- Batch 26 — Durcissement Storage : MIME + taille enforcés côté serveur
-- La validation client dans lib/fileValidation.ts est bypassable.
-- Vraie défense : bucket policies Supabase Storage.
--
-- À exécuter DANS Supabase → SQL Editor.
-- Si tu préfères l'UI : Dashboard → Storage → <bucket> → Configuration
-- tu retrouves les mêmes champs (allowed_mime_types, file_size_limit).

-- ─── Bucket annonces-photos (photos biens + EDL) ──────────────────────────────
-- Images uniquement, 10 Mo max par fichier
UPDATE storage.buckets
   SET public              = true,
       file_size_limit     = 10485760,  -- 10 Mo
       allowed_mime_types  = ARRAY[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'image/heif'
       ]
 WHERE id = 'annonces-photos';

-- Si le bucket n'existe pas encore, le créer :
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'annonces-photos', 'annonces-photos', true, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- ─── Bucket dossiers (dossier locataire : pièces + justificatifs) ─────────────
-- Images + PDF, 15 Mo max
UPDATE storage.buckets
   SET public              = true,
       file_size_limit     = 15728640,  -- 15 Mo
       allowed_mime_types  = ARRAY[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'image/heif',
         'application/pdf'
       ]
 WHERE id = 'dossiers';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dossiers', 'dossiers', true, 15728640,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ─── Policies RLS storage.objects ─────────────────────────────────────────────
-- L'utilisateur connecté ne peut upload QUE dans son propre dossier
-- (path commence par son email). Lecture publique (les URLs sont dans les annonces).

-- annonces-photos : insert own folder only
DROP POLICY IF EXISTS "annonces_photos_insert_own" ON storage.objects;
CREATE POLICY "annonces_photos_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'annonces-photos'
    AND (storage.foldername(name))[1] = auth.jwt() ->> 'email'
    -- Le sous-dossier "edl/..." utilise un préfixe différent : autoriser aussi
    OR (bucket_id = 'annonces-photos' AND name LIKE 'edl/' || (auth.jwt() ->> 'email') || '/%')
  );

DROP POLICY IF EXISTS "annonces_photos_select_public" ON storage.objects;
CREATE POLICY "annonces_photos_select_public" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'annonces-photos');

DROP POLICY IF EXISTS "annonces_photos_delete_own" ON storage.objects;
CREATE POLICY "annonces_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'annonces-photos'
    AND (
      (storage.foldername(name))[1] = auth.jwt() ->> 'email'
      OR name LIKE 'edl/' || (auth.jwt() ->> 'email') || '/%'
    )
  );

-- dossiers : insert own folder only, lecture publique (URLs dans table profils)
DROP POLICY IF EXISTS "dossiers_insert_own" ON storage.objects;
CREATE POLICY "dossiers_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dossiers'
    AND (storage.foldername(name))[1] = auth.jwt() ->> 'email'
  );

DROP POLICY IF EXISTS "dossiers_select_public" ON storage.objects;
CREATE POLICY "dossiers_select_public" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'dossiers');

DROP POLICY IF EXISTS "dossiers_delete_own" ON storage.objects;
CREATE POLICY "dossiers_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dossiers'
    AND (storage.foldername(name))[1] = auth.jwt() ->> 'email'
  );
