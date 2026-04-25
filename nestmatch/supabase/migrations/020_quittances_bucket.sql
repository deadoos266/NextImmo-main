-- Migration 020 : bucket "quittances" + colonne loyers.quittance_pdf_url
--
-- Stockage persistant des quittances générées au moment où le proprio
-- confirme le loyer reçu. Le PDF est uploadé dans le bucket public
-- `quittances` puis l'URL est posée sur la ligne de loyer correspondante.
--
-- Avant cette migration : le PDF était téléchargé côté proprio via
-- `doc.save()` sans persistence. Le locataire ne pouvait pas retrouver
-- ses quittances passées si la card de chat était perdue.

-- 1. Création du bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quittances',
  'quittances',
  true,
  10485760,  -- 10 Mo par PDF (large)
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy lecture publique (les URLs sont signées par convention de path :
--    {locataire_email}/{annonce_id}/{periode}-{ts}.pdf — pas devinable).
DROP POLICY IF EXISTS "quittances_public_select" ON storage.objects;
CREATE POLICY "quittances_public_select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'quittances');

-- 3. Policy upload : proprio authentifié uniquement (le service_role
--    contourne RLS donc l'API serveur peut toujours upload via service key).
DROP POLICY IF EXISTS "quittances_authenticated_insert" ON storage.objects;
CREATE POLICY "quittances_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'quittances');

-- 4. Colonne URL sur la table loyers
ALTER TABLE public.loyers
  ADD COLUMN IF NOT EXISTS quittance_pdf_url text;

NOTIFY pgrst, 'reload schema';
