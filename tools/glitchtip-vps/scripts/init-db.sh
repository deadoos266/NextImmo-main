#!/usr/bin/env bash
# Crée la DB Postgres + rôle pour GlitchTip dans le keymatch-postgres existant.
# V97.39.34 Phase 7 KeyMatch.
#
# Idempotent : safe à relancer.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ .env introuvable."
  exit 1
fi

# shellcheck disable=SC1091
source .env

if [ -z "${GLITCHTIP_DB_PASSWORD:-}" ] || [ ${#GLITCHTIP_DB_PASSWORD} -lt 16 ]; then
  echo "❌ GLITCHTIP_DB_PASSWORD vide ou < 16 chars dans .env"
  exit 1
fi

# Échappe les apostrophes pour le SQL inline
PWD_ESCAPED=$(printf "%s" "$GLITCHTIP_DB_PASSWORD" | sed "s/'/''/g")

sudo docker exec -i keymatch-postgres psql -U keymatch -d postgres <<SQL
-- Rôle dédié glitchtip (LOGIN, password depuis .env)
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'glitchtip') THEN
    CREATE ROLE glitchtip LOGIN PASSWORD '$PWD_ESCAPED';
  ELSE
    ALTER ROLE glitchtip WITH PASSWORD '$PWD_ESCAPED';
  END IF;
END
\$\$;

-- DB séparée (le `;` rend la query non-transactionnelle ce qui permet
-- CREATE DATABASE).
SQL

# CREATE DATABASE ne peut pas être dans un bloc DO. On le fait séparément
# avec un check d'existence côté shell.
DB_EXISTS=$(sudo docker exec keymatch-postgres psql -U keymatch -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='glitchtip'" | tr -d ' \r')

if [ "$DB_EXISTS" != "1" ]; then
  sudo docker exec keymatch-postgres psql -U keymatch -d postgres -c \
    "CREATE DATABASE glitchtip OWNER glitchtip;"
  echo "✅ DB glitchtip créée"
else
  echo "ℹ DB glitchtip déjà existante (skip)"
fi

# Extensions requises par GlitchTip dans la DB glitchtip
sudo docker exec keymatch-postgres psql -U keymatch -d glitchtip -c \
  "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# Vérification finale
sudo docker exec keymatch-postgres psql -U keymatch -d postgres -c \
  "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database WHERE datname IN ('keymatch','glitchtip');"

echo ""
echo "✅ GlitchTip DB prête"
echo "Next : sudo docker compose up -d && wait, then sudo docker compose exec web ./manage.py migrate"
