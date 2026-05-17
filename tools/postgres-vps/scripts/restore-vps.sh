#!/usr/bin/env bash
# Restore le dump Supabase dans le Postgres local (container keymatch-postgres).
#
# Usage :
#   cd tools/postgres-vps && ./scripts/restore-vps.sh [dump-file.sql.gz]
#
# Si pas d'argument : utilise le dump le plus récent de dumps/.
#
# ⚠ IMPORTANT : ce script ÉCRASE les données existantes dans le DB cible
# (DROP SCHEMA public CASCADE; CREATE SCHEMA public). Idempotent — refaire
# un restore = pareil que la première fois. Aucun impact sur Supabase prod
# (read-only depuis le dump).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "❌ ${ROOT_DIR}/.env manquant" >&2
  exit 1
fi
set -a; source "${ROOT_DIR}/.env"; set +a

DUMP_FILE="${1:-}"
if [[ -z "${DUMP_FILE}" ]]; then
  DUMP_FILE=$(ls -t "${ROOT_DIR}/dumps/"keymatch-supabase-*.sql.gz 2>/dev/null | head -1 || true)
fi
if [[ -z "${DUMP_FILE}" || ! -f "${DUMP_FILE}" ]]; then
  echo "❌ Aucun dump trouvé. Lance ./scripts/dump-supabase.sh d'abord." >&2
  exit 1
fi

echo "→ Dump source : ${DUMP_FILE}"
echo "  Taille : $(du -h "${DUMP_FILE}" | cut -f1)"
echo ""

# Vérif que le container postgres tourne
if ! docker compose ps postgres 2>/dev/null | grep -q "running\|healthy"; then
  echo "❌ Container 'postgres' pas démarré. Lance: docker compose up -d postgres" >&2
  exit 1
fi

# Recrée le schéma public proprement (idempotent)
echo "→ Drop + recrée schema public (idempotent restore)"
docker compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
SQL

echo "→ Restore en cours..."
zcat "${DUMP_FILE}" | docker compose exec -T postgres psql \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --set ON_ERROR_STOP=on \
  -v ON_ERROR_STOP=on \
  2>&1 | tail -20

echo ""
echo "→ Stats post-restore :"
docker compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "
  SELECT count(*) AS tables FROM pg_tables WHERE schemaname='public';
  SELECT count(*) AS indexes FROM pg_indexes WHERE schemaname='public';
  SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
"
