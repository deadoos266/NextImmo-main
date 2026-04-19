-- Migration 015 : Bucket baux + nouveau statut "bail_envoye" (en attente signature)
--
-- Bucket pour les PDF uploadés par les proprios qui ont déjà leur bail (avocat,
-- autre appli, etc.) et veulent juste l'envoyer au locataire pour signature.
-- PDF uniquement, 15 Mo max.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'baux', 'baux', true, 15728640,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public = EXCLUDED.public;

-- Policies RLS storage.objects pour le bucket baux
DROP POLICY IF EXISTS "baux_insert_own" ON storage.objects;
CREATE POLICY "baux_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'baux'
    AND (storage.foldername(name))[1] = auth.jwt() ->> 'email'
  );

DROP POLICY IF EXISTS "baux_select_public" ON storage.objects;
CREATE POLICY "baux_select_public" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'baux');

DROP POLICY IF EXISTS "baux_delete_own" ON storage.objects;
CREATE POLICY "baux_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'baux'
    AND (storage.foldername(name))[1] = auth.jwt() ->> 'email'
  );

-- Le statut "bail_envoye" est un état intermédiaire entre "disponible" et "loué" :
-- le proprio a envoyé le bail au locataire mais celui-ci n'a pas encore signé.
-- Pas de changement SQL nécessaire (statut est déjà text libre), mais la valeur
-- est documentée dans le commentaire de table.

COMMENT ON COLUMN public.annonces.statut IS
  'disponible | bail_envoye (en attente signature locataire) | loué';

NOTIFY pgrst, 'reload schema';
