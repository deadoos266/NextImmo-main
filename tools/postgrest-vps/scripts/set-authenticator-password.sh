#!/usr/bin/env bash
# Configure le password du rôle 'authenticator' (utilisé par PostgREST pour
# se connecter à Postgres).
# Lit POSTGREST_DB_PASSWORD depuis .env, l'applique via ALTER ROLE.
#
# Usage : sudo bash scripts/set-authenticator-password.sh

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ .env introuvable."
  exit 1
fi

# shellcheck disable=SC1091
source .env

if [ -z "${POSTGREST_DB_PASSWORD:-}" ] || [ ${#POSTGREST_DB_PASSWORD} -lt 16 ]; then
  echo "❌ POSTGREST_DB_PASSWORD manquant ou trop court dans .env (min 16 chars)."
  exit 1
fi

# Échappe les apostrophes pour le SQL inline.
PWD_ESCAPED=$(printf "%s" "$POSTGREST_DB_PASSWORD" | sed "s/'/''/g")

sudo docker exec -i keymatch-postgres psql -U keymatch -d keymatch <<SQL
ALTER ROLE authenticator WITH PASSWORD '$PWD_ESCAPED';
SQL

echo "✅ Password authenticator mis à jour."
echo "Test connexion :"
PGPASSWORD="$POSTGREST_DB_PASSWORD" sudo docker exec -i keymatch-postgres \
  psql -h localhost -U authenticator -d keymatch -c "SELECT current_user, session_user;"
