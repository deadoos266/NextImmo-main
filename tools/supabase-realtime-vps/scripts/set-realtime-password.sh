#!/usr/bin/env bash
# Configure le password supabase_realtime_admin depuis REALTIME_DB_PASSWORD (.env).
# V97.39.33 Phase 7b
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ .env introuvable."
  exit 1
fi

# shellcheck disable=SC1091
source .env

if [ -z "${REALTIME_DB_PASSWORD:-}" ] || [ ${#REALTIME_DB_PASSWORD} -lt 16 ]; then
  echo "❌ REALTIME_DB_PASSWORD manquant ou trop court (.env)"
  exit 1
fi

PWD_ESCAPED=$(printf "%s" "$REALTIME_DB_PASSWORD" | sed "s/'/''/g")

sudo docker exec -i keymatch-postgres psql -U keymatch -d keymatch <<SQL
ALTER ROLE supabase_realtime_admin WITH PASSWORD '$PWD_ESCAPED';
SQL

echo "✅ Password supabase_realtime_admin mis à jour."
