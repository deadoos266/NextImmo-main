-- Phase 3 — Réécrit les URLs Supabase Storage en URLs MinIO dans Postgres.
--
-- À LANCER UNE SEULE FOIS au moment du cutover Phase 3, juste après que
-- `migrate-via-rest.sh` a copié tous les fichiers vers MinIO. À appliquer
-- sur la prod Supabase (PAS le shadow VPS) car flip STORAGE_PROVIDER=minio
-- côté Vercel signifie que la prod sert via MinIO URLs.
--
-- Idempotent : si une URL est déjà sur media.keymatch-immo.fr, REPLACE ne
-- fait rien. Mais on évite quand même de re-run pour limiter les locks.
--
-- ⚠ TOURNE D'ABORD EN DRY-RUN :
--     psql ... -v dry_run=1 -f rewrite-storage-urls.sql
--   Vérifie les counts, puis :
--     psql ... -v dry_run=0 -f rewrite-storage-urls.sql
--
-- Backup recommandé AVANT :
--     pg_dump -t annonces -t profils -t bail_avenants -t historique_baux \
--             -t loyers -t quittances_perso -t etats_des_lieux -t user_bug_reports \
--             > pre-rewrite-backup.sql
--
-- V97.39.26 — Schéma audité sur la prod Supabase via Postgres VPS shadow :
--   Colonnes qui contiennent des URLs supabase.co/storage :
--     - annonces.photos          JSONB array
--     - annonces.bail_pdf_url    text
--     - profils.dossier_docs     JSONB { type: { url, ... } }
--     - profils.photo_url_custom text
--     - bail_avenants.pdf_url    text
--     - historique_baux.bail_pdf_url    text
--     - loyers.quittance_pdf_url        text
--     - quittances_perso.fichier_url    text
--     - etats_des_lieux.pdf_url_externe text
--     - user_bug_reports.screenshot_url text
--   (Audit live : ~14 rows à réécrire, volume négligeable)

\set ON_ERROR_STOP on

-- Paramètres
\set new_base 'https://media.keymatch-immo.fr'

\echo ''
\echo '════════════════════════════════════════════════'
\echo ' DRY-RUN — counts par colonne avant write'
\echo '════════════════════════════════════════════════'

SELECT 'annonces.photos' AS col, count(*) FILTER (WHERE photos::text LIKE '%supabase.co/storage%') AS to_rewrite, count(*) AS total FROM annonces
UNION ALL SELECT 'annonces.bail_pdf_url', count(*) FILTER (WHERE bail_pdf_url LIKE '%supabase.co/storage%'), count(*) FROM annonces
UNION ALL SELECT 'profils.dossier_docs', count(*) FILTER (WHERE dossier_docs::text LIKE '%supabase.co/storage%'), count(*) FROM profils
UNION ALL SELECT 'profils.photo_url_custom', count(*) FILTER (WHERE photo_url_custom LIKE '%supabase.co/storage%'), count(*) FROM profils
UNION ALL SELECT 'bail_avenants.pdf_url', count(*) FILTER (WHERE pdf_url LIKE '%supabase.co/storage%'), count(*) FROM bail_avenants
UNION ALL SELECT 'historique_baux.bail_pdf_url', count(*) FILTER (WHERE bail_pdf_url LIKE '%supabase.co/storage%'), count(*) FROM historique_baux
UNION ALL SELECT 'loyers.quittance_pdf_url', count(*) FILTER (WHERE quittance_pdf_url LIKE '%supabase.co/storage%'), count(*) FROM loyers
UNION ALL SELECT 'quittances_perso.fichier_url', count(*) FILTER (WHERE fichier_url LIKE '%supabase.co/storage%'), count(*) FROM quittances_perso
UNION ALL SELECT 'etats_des_lieux.pdf_url_externe', count(*) FILTER (WHERE pdf_url_externe LIKE '%supabase.co/storage%'), count(*) FROM etats_des_lieux
UNION ALL SELECT 'user_bug_reports.screenshot_url', count(*) FILTER (WHERE screenshot_url LIKE '%supabase.co/storage%'), count(*) FROM user_bug_reports
ORDER BY to_rewrite DESC
;

\if :dry_run
  \echo ''
  \echo 'DRY-RUN actif (dry_run=1). Aucune écriture. Relance avec -v dry_run=0 pour appliquer.'
  \q
\endif

\echo ''
\echo '════════════════════════════════════════════════'
\echo ' WRITE — réécriture en transaction'
\echo '════════════════════════════════════════════════'

BEGIN;

-- Fonction helper : remplace `https://<ref>.supabase.co/storage/v1/object/(public|sign)/<bucket>/<path>(?...)`
-- par `<new_base>/<bucket>/<path>`. Le query string (?token=...) est strip
-- (signed URLs Supabase n'ont plus de sens dans MinIO, lib/storage.ts re-signe
-- à la volée pour les buckets privés).
CREATE OR REPLACE FUNCTION pg_temp.rewrite_storage_url(url text, new_base text) RETURNS text AS $$
DECLARE
  rewritten text;
BEGIN
  IF url IS NULL OR url NOT LIKE '%supabase.co/storage%' THEN
    RETURN url;
  END IF;
  rewritten := regexp_replace(url,
    '^https?://[^/]+\.supabase\.co/storage/v1/object/(public|sign)/([^/?]+)/([^?]+)(\?.*)?$',
    new_base || '/\2/\3'
  );
  RETURN rewritten;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog, public;

-- annonces.photos : JSONB array de strings
-- V97.39.26 fix : utiliser to_jsonb() pour wrap le text en JSON string,
-- pas un cast direct ::jsonb qui tente de parser "https://..." comme JSON.
UPDATE annonces
SET photos = (
  SELECT jsonb_agg(to_jsonb(pg_temp.rewrite_storage_url(p::text, :'new_base')))
  FROM jsonb_array_elements_text(photos) p
)
WHERE photos::text LIKE '%supabase.co/storage%';

-- annonces.bail_pdf_url
UPDATE annonces
SET bail_pdf_url = pg_temp.rewrite_storage_url(bail_pdf_url, :'new_base')
WHERE bail_pdf_url LIKE '%supabase.co/storage%';

-- profils.dossier_docs : JSONB { "type_doc": [url1, url2, ...], ... }
-- V97.39.26 — structure réelle inspectée sur prod : object dont chaque
-- valeur est un array de strings (URLs des fichiers uploadés).
UPDATE profils
SET dossier_docs = (
  SELECT jsonb_object_agg(k,
    CASE WHEN jsonb_typeof(v) = 'array' THEN
      (SELECT jsonb_agg(to_jsonb(pg_temp.rewrite_storage_url(elt, :'new_base')))
       FROM jsonb_array_elements_text(v) elt)
    ELSE v
    END
  )
  FROM jsonb_each(dossier_docs) AS d(k, v)
)
WHERE dossier_docs::text LIKE '%supabase.co/storage%';

-- profils.photo_url_custom : text nullable
UPDATE profils
SET photo_url_custom = pg_temp.rewrite_storage_url(photo_url_custom, :'new_base')
WHERE photo_url_custom LIKE '%supabase.co/storage%';

-- bail_avenants.pdf_url
UPDATE bail_avenants
SET pdf_url = pg_temp.rewrite_storage_url(pdf_url, :'new_base')
WHERE pdf_url LIKE '%supabase.co/storage%';

-- historique_baux.bail_pdf_url
UPDATE historique_baux
SET bail_pdf_url = pg_temp.rewrite_storage_url(bail_pdf_url, :'new_base')
WHERE bail_pdf_url LIKE '%supabase.co/storage%';

-- loyers.quittance_pdf_url
UPDATE loyers
SET quittance_pdf_url = pg_temp.rewrite_storage_url(quittance_pdf_url, :'new_base')
WHERE quittance_pdf_url LIKE '%supabase.co/storage%';

-- quittances_perso.fichier_url
UPDATE quittances_perso
SET fichier_url = pg_temp.rewrite_storage_url(fichier_url, :'new_base')
WHERE fichier_url LIKE '%supabase.co/storage%';

-- etats_des_lieux.pdf_url_externe
UPDATE etats_des_lieux
SET pdf_url_externe = pg_temp.rewrite_storage_url(pdf_url_externe, :'new_base')
WHERE pdf_url_externe LIKE '%supabase.co/storage%';

-- user_bug_reports.screenshot_url
UPDATE user_bug_reports
SET screenshot_url = pg_temp.rewrite_storage_url(screenshot_url, :'new_base')
WHERE screenshot_url LIKE '%supabase.co/storage%';

\echo ''
\echo '════════════════════════════════════════════════'
\echo ' Vérification post-rewrite (DOIT être 0 partout)'
\echo '════════════════════════════════════════════════'

SELECT 'annonces.photos' AS col, count(*) FILTER (WHERE photos::text LIKE '%supabase.co/storage%') AS still_to_rewrite FROM annonces
UNION ALL SELECT 'annonces.bail_pdf_url', count(*) FILTER (WHERE bail_pdf_url LIKE '%supabase.co/storage%') FROM annonces
UNION ALL SELECT 'profils.dossier_docs', count(*) FILTER (WHERE dossier_docs::text LIKE '%supabase.co/storage%') FROM profils
UNION ALL SELECT 'profils.photo_url_custom', count(*) FILTER (WHERE photo_url_custom LIKE '%supabase.co/storage%') FROM profils
UNION ALL SELECT 'bail_avenants.pdf_url', count(*) FILTER (WHERE pdf_url LIKE '%supabase.co/storage%') FROM bail_avenants
UNION ALL SELECT 'historique_baux.bail_pdf_url', count(*) FILTER (WHERE bail_pdf_url LIKE '%supabase.co/storage%') FROM historique_baux
UNION ALL SELECT 'loyers.quittance_pdf_url', count(*) FILTER (WHERE quittance_pdf_url LIKE '%supabase.co/storage%') FROM loyers
UNION ALL SELECT 'quittances_perso.fichier_url', count(*) FILTER (WHERE fichier_url LIKE '%supabase.co/storage%') FROM quittances_perso
UNION ALL SELECT 'etats_des_lieux.pdf_url_externe', count(*) FILTER (WHERE pdf_url_externe LIKE '%supabase.co/storage%') FROM etats_des_lieux
UNION ALL SELECT 'user_bug_reports.screenshot_url', count(*) FILTER (WHERE screenshot_url LIKE '%supabase.co/storage%') FROM user_bug_reports
ORDER BY still_to_rewrite DESC
;

-- Si toutes les colonnes sont à 0 → COMMIT. Sinon → l'opérateur ROLLBACK.
\echo ''
\echo '⚠ Vérifier que still_to_rewrite = 0 partout, puis :'
\echo '    COMMIT;   -- pour appliquer'
\echo '  ou'
\echo '    ROLLBACK; -- si des lignes restent'
\echo ''
-- Pas de COMMIT automatique. À faire à la main pour double-check.
