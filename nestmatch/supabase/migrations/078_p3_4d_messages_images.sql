-- P3-4.D — Images dans messages (V97.20)
--
-- Bucket Supabase Storage privé pour les images uploadées dans les conversations.
-- Path opaque (UUID v4) pour éviter l'énumération. Lecture via signed URL
-- générée côté server (/api/messages/image-url) après check de participation.
--
-- Pattern V97.10 (bug-screenshots) re-appliqué : RLS INSERT pour anon/auth
-- (le browser uploade direct sans signed upload URL), pas de SELECT public.
--
-- Format stocké dans messages.contenu : "[IMG]<path>"
-- Ex: "[IMG]a3b1c2d4-uuid/photo-1715508000.jpg"
-- Le client appelle /api/messages/image-url?path=<path> qui auth + signed URL.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'messages-images',
  'messages-images',
  false,
  10485760,  -- 10 MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

DROP POLICY IF EXISTS "messages_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "messages_images_select" ON storage.objects;

-- INSERT : tous les users authentifiés (NextAuth gated côté app, mais ici on
-- accepte aussi anon au cas où — la création de message côté API exige
-- toujours session, donc une image orpheline sans message reste inutile).
CREATE POLICY "messages_images_insert" ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'messages-images');

-- Pas de policy SELECT publique : les signed URLs sont générées côté server
-- via supabaseAdmin (service_role bypass RLS) après vérification que le user
-- demandeur est participant d'une conv contenant ce message.

COMMIT;
