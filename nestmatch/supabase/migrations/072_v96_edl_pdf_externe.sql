-- V96.1 — Permet de joindre un PDF EDL externe à un état des lieux.
--
-- Cas d'usage : à l'import d'un bail, si le proprio coche "EDL d'entrée a
-- été signé entre les 2 parties hors plateforme", il doit pouvoir uploader
-- le PDF de cet EDL (preuve juridique). Cette URL est stockée sur la row
-- `etats_des_lieux` créée à l'acceptance par /api/bail/accepter V89.9.
--
-- Différent du flow EDL natif KeyMatch qui génère un PDF via jsPDF :
-- ici on garde l'EDL papier/PDF original signé hors plateforme.

BEGIN;

ALTER TABLE public.etats_des_lieux
  ADD COLUMN IF NOT EXISTS pdf_url_externe text;

COMMENT ON COLUMN public.etats_des_lieux.pdf_url_externe IS
  'V96.1 — URL Supabase Storage du PDF EDL signé hors plateforme (cas import bail avec EDL déjà fait). Le PDF reste la référence juridique.';

NOTIFY pgrst, 'reload schema';

COMMIT;
