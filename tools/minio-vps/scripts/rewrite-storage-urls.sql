-- Phase 3 — Réécrit les URLs Supabase Storage en URLs MinIO dans Postgres.
--
-- À LANCER UNE SEULE FOIS après que `migrate-from-supabase.sh` a copié tous
-- les fichiers vers MinIO, juste avant le flip STORAGE_PROVIDER=minio.
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
--     pg_dump -t annonces -t profils -t baux -t edl_pieces -t quittances \
--       -t messages -t bug_reports -t edl > pre-rewrite-backup.sql

\set ON_ERROR_STOP on

-- Paramètres
-- Remplace par l'URL finale du Caddy MinIO en prod.
\set new_base 'https://media.keymatch-immo.fr'
-- Domaine actuel à remplacer (Supabase Storage CDN)
-- Note : on utilise un wildcard car le project_ref Supabase est variable.
-- Format Supabase : https://<project_ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
-- Format Supabase signed : https://<project_ref>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=...
-- Cible MinIO : <new_base>/<bucket>/<path>

\echo ''
\echo '════════════════════════════════════════════════'
\echo ' DRY-RUN — counts par table avant write'
\echo '════════════════════════════════════════════════'

SELECT 'annonces.photos' AS column,
       count(*) FILTER (WHERE photos::text LIKE '%supabase.co/storage%') AS to_rewrite,
       count(*) AS total
FROM annonces
UNION ALL
SELECT 'profils.avatar_url',
       count(*) FILTER (WHERE avatar_url LIKE '%supabase.co/storage%'),
       count(*)
FROM profils
UNION ALL
SELECT 'profils.dossier_docs',
       count(*) FILTER (WHERE dossier_docs::text LIKE '%supabase.co/storage%'),
       count(*)
FROM profils
UNION ALL
SELECT 'baux.pdf_url',
       count(*) FILTER (WHERE pdf_url LIKE '%supabase.co/storage%'),
       count(*)
FROM baux
UNION ALL
SELECT 'edl_pieces.photos',
       count(*) FILTER (WHERE photos::text LIKE '%supabase.co/storage%'),
       count(*)
FROM edl_pieces
UNION ALL
SELECT 'quittances.pdf_url',
       count(*) FILTER (WHERE pdf_url LIKE '%supabase.co/storage%'),
       count(*)
FROM quittances
UNION ALL
SELECT 'messages.image_url',
       count(*) FILTER (WHERE image_url LIKE '%supabase.co/storage%'),
       count(*)
FROM messages
UNION ALL
SELECT 'bug_reports.screenshot_path',
       count(*) FILTER (WHERE screenshot_path LIKE '%supabase.co/storage%'),
       count(*)
FROM bug_reports
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

-- Fonction helper : remplace tout `https://<ref>.supabase.co/storage/v1/object/(public|sign)/<bucket>/<path>(?...)`
-- par `<new_base>/<bucket>/<path>`. Le query string (?token=...) est strip
-- car les signed URLs Supabase n'ont plus de sens dans MinIO. Côté Next.js,
-- lib/storage.ts re-signe à la volée si bucket privé.
CREATE OR REPLACE FUNCTION pg_temp.rewrite_storage_url(url text, new_base text) RETURNS text AS $$
DECLARE
  rewritten text;
BEGIN
  IF url IS NULL OR url NOT LIKE '%supabase.co/storage%' THEN
    RETURN url;
  END IF;
  -- Cas public : /storage/v1/object/public/<bucket>/<path>
  rewritten := regexp_replace(url,
    '^https?://[^/]+\.supabase\.co/storage/v1/object/(public|sign)/([^/?]+)/([^?]+)(\?.*)?$',
    new_base || '/\2/\3'
  );
  RETURN rewritten;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;
-- IMMUTABLE car pour (url, new_base) fixés, output toujours identique.
-- PARALLEL SAFE pour permettre la parallélisation des UPDATE.

-- annonces.photos : JSONB array de strings
UPDATE annonces
SET photos = (
  SELECT jsonb_agg(pg_temp.rewrite_storage_url(p::text, :'new_base')::jsonb)
  FROM jsonb_array_elements_text(photos) p
)
WHERE photos::text LIKE '%supabase.co/storage%';

-- profils.avatar_url : string nullable
UPDATE profils
SET avatar_url = pg_temp.rewrite_storage_url(avatar_url, :'new_base')
WHERE avatar_url LIKE '%supabase.co/storage%';

-- profils.dossier_docs : JSONB { type: { url, name, ... } }
-- On parcourt chaque key + url. C'est plus subtile car structure imbriquée.
UPDATE profils
SET dossier_docs = (
  SELECT jsonb_object_agg(k, jsonb_set(v, '{url}',
    to_jsonb(pg_temp.rewrite_storage_url(v->>'url', :'new_base'))
  ))
  FROM jsonb_each(dossier_docs) AS d(k, v)
  WHERE v->>'url' IS NOT NULL
)
WHERE dossier_docs::text LIKE '%supabase.co/storage%';

-- baux.pdf_url
UPDATE baux
SET pdf_url = pg_temp.rewrite_storage_url(pdf_url, :'new_base')
WHERE pdf_url LIKE '%supabase.co/storage%';

-- edl_pieces.photos : JSONB array
UPDATE edl_pieces
SET photos = (
  SELECT jsonb_agg(pg_temp.rewrite_storage_url(p::text, :'new_base')::jsonb)
  FROM jsonb_array_elements_text(photos) p
)
WHERE photos::text LIKE '%supabase.co/storage%';

-- quittances.pdf_url
UPDATE quittances
SET pdf_url = pg_temp.rewrite_storage_url(pdf_url, :'new_base')
WHERE pdf_url LIKE '%supabase.co/storage%';

-- messages.image_url
UPDATE messages
SET image_url = pg_temp.rewrite_storage_url(image_url, :'new_base')
WHERE image_url LIKE '%supabase.co/storage%';

-- bug_reports.screenshot_path : stocke le PATH (pas l'URL complète),
-- donc rien à réécrire ici. lib/storage.ts génère la signed URL à la volée.

\echo ''
\echo '════════════════════════════════════════════════'
\echo ' Vérification post-rewrite'
\echo '════════════════════════════════════════════════'

-- Re-affiche les counts (devraient être tous à 0 sur to_rewrite)
SELECT 'annonces.photos' AS column,
       count(*) FILTER (WHERE photos::text LIKE '%supabase.co/storage%') AS still_to_rewrite
FROM annonces
UNION ALL
SELECT 'profils.avatar_url',
       count(*) FILTER (WHERE avatar_url LIKE '%supabase.co/storage%')
FROM profils
UNION ALL
SELECT 'profils.dossier_docs',
       count(*) FILTER (WHERE dossier_docs::text LIKE '%supabase.co/storage%')
FROM profils
UNION ALL
SELECT 'baux.pdf_url',
       count(*) FILTER (WHERE pdf_url LIKE '%supabase.co/storage%')
FROM baux
UNION ALL
SELECT 'edl_pieces.photos',
       count(*) FILTER (WHERE photos::text LIKE '%supabase.co/storage%')
FROM edl_pieces
UNION ALL
SELECT 'quittances.pdf_url',
       count(*) FILTER (WHERE pdf_url LIKE '%supabase.co/storage%')
FROM quittances
UNION ALL
SELECT 'messages.image_url',
       count(*) FILTER (WHERE image_url LIKE '%supabase.co/storage%')
FROM messages
;

-- Si toutes les colonnes sont à 0 → COMMIT. Sinon → l'opérateur ROLLBACK.
\echo ''
\echo '⚠ Vérifier que still_to_rewrite = 0 partout, puis :'
\echo '    COMMIT;'
\echo '  ou'
\echo '    ROLLBACK;  -- si des lignes restent'
\echo ''
-- Pas de COMMIT automatique. À faire à la main pour double-check.
