#!/usr/bin/env bash
# Dump Supabase prod vers fichier local (read-only, ZERO impact prod).
#
# Usage :
#   cd tools/postgres-vps && ./scripts/dump-supabase.sh
#
# Pré-requis :
#   - .env rempli avec SUPABASE_DB_URL (cf .env.example)
#   - pg_dump 16 installé localement (`apt install postgresql-client-16`
#     ou `docker run postgres:16 pg_dump ...`)
#
# Output : ./dumps/keymatch-supabase-YYYY-MM-DD-HHmm.sql.gz

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "❌ ${ROOT_DIR}/.env manquant. Copie .env.example et remplis." >&2
  exit 1
fi

# Source .env (variables exportées)
set -a
# shellcheck disable=SC1091
source "${ROOT_DIR}/.env"
set +a

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "❌ SUPABASE_DB_URL vide dans .env" >&2
  echo "   Trouve-le dans Supabase Dashboard → Project Settings → Database → Connection String → URI" >&2
  exit 1
fi

DUMPS_DIR="${ROOT_DIR}/dumps"
mkdir -p "${DUMPS_DIR}"
TIMESTAMP="$(date +%Y-%m-%d-%H%M)"
DUMP_FILE="${DUMPS_DIR}/keymatch-supabase-${TIMESTAMP}.sql.gz"

echo "→ Dump Supabase vers ${DUMP_FILE}"
echo "  (lecture seule, aucun impact sur la prod)"
echo ""

# Pourquoi ces options :
# --schema=public : on ne migre que le schéma public (skip auth, storage,
#   realtime, supabase_functions, vault — ils sont gérés par Supabase et ne
#   font pas partie de notre data métier)
# --no-owner --no-privileges : permet de restorer sur un autre user (keymatch)
#   sans erreur de role inexistant
# --no-comments : skip COMMENT ON statements (parfois cassent sur des roles
#   inconnus)
# --quote-all-identifiers : robuste contre les casse-sensibles
# -F p : format plain text (gzippé après) pour pouvoir grep/inspect

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump \
    --schema=public \
    --no-owner \
    --no-privileges \
    --no-comments \
    --quote-all-identifiers \
    -F p \
    "${SUPABASE_DB_URL}" \
    | gzip -9 > "${DUMP_FILE}"
else
  echo "ℹ pg_dump non installé localement, fallback Docker"
  docker run --rm \
    -v "${DUMPS_DIR}:/dumps" \
    postgres:16-alpine \
    sh -c "pg_dump --schema=public --no-owner --no-privileges --no-comments --quote-all-identifiers -F p \"${SUPABASE_DB_URL}\" | gzip -9" \
    > "${DUMP_FILE}"
fi

SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
echo ""
echo "✓ Dump terminé : ${DUMP_FILE} (${SIZE})"
echo ""
echo "Inspection rapide du contenu :"
zcat "${DUMP_FILE}" | head -20
echo "  ..."
echo "Lignes totales : $(zcat "${DUMP_FILE}" | wc -l)"
echo "Tables COPY :    $(zcat "${DUMP_FILE}" | grep -c '^COPY public.')"
echo "Indexes CREATE : $(zcat "${DUMP_FILE}" | grep -c '^CREATE INDEX')"
