#!/usr/bin/env bash
# Setup tenant supabase/realtime pour KeyMatch.
# V97.39.33 Phase 7b — automatise les 3 étapes manuelles découvertes lors
# du premier déploiement :
#   1. Rename tenant external_id de "realtime-dev" (seed default) → "db"
#      (match avec le subdomain db.keymatch-immo.fr que le SDK envoie)
#   2. Encrypt POSTGREST_JWT_SECRET avec REALTIME_ENC_KEY (AES-128 GCM)
#      via /app/bin/realtime eval Realtime.Crypto.encrypt!
#   3. UPDATE _realtime.tenants SET jwt_secret = <encrypted_b64>
#
# Idempotent : safe à relancer.
#
# Pré-requis :
#   - keymatch-supabase-realtime container UP
#   - .env du dossier supabase-realtime-vps/ rempli
#   - .env du dossier postgrest-vps/ rempli (pour POSTGREST_JWT_SECRET)

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ .env supabase-realtime-vps introuvable."
  exit 1
fi
if [ ! -f ../postgrest-vps/.env ]; then
  echo "❌ .env postgrest-vps introuvable."
  exit 1
fi

# shellcheck disable=SC1091
source .env
PGRST_JWT=$(grep ^POSTGREST_JWT_SECRET ../postgrest-vps/.env | cut -d= -f2)

if [ -z "$PGRST_JWT" ]; then
  echo "❌ POSTGREST_JWT_SECRET vide dans postgrest-vps/.env"
  exit 1
fi

echo "🔐 Encrypt POSTGREST_JWT_SECRET avec REALTIME_ENC_KEY…"
ENCRYPTED=$(sudo docker exec keymatch-supabase-realtime /app/bin/realtime eval "IO.puts(Realtime.Crypto.encrypt!(\"$PGRST_JWT\"))" 2>/dev/null | tail -1 | tr -d '\r')

if [ -z "$ENCRYPTED" ]; then
  echo "❌ Encryption échouée. Vérifier que keymatch-supabase-realtime est UP."
  exit 1
fi
echo "✅ JWT secret chiffré (length=${#ENCRYPTED})"

echo ""
echo "🔧 UPDATE _realtime.tenants…"
# Le seed crée par défaut un tenant "realtime-dev" qu'on renomme en "db"
# (match le subdomain de db.keymatch-immo.fr). Gère le FK extensions via
# session_replication_role=replica.
ESCAPED=$(printf "%s" "$ENCRYPTED" | sed "s/'/''/g")

sudo docker exec -i keymatch-postgres psql -U keymatch -d keymatch <<SQL
BEGIN;
SET session_replication_role = 'replica';

-- 1) Rename tenant + FK extensions si encore "realtime-dev"
UPDATE _realtime.extensions
   SET tenant_external_id = 'db'
 WHERE tenant_external_id = 'realtime-dev';

UPDATE _realtime.tenants
   SET external_id = 'db', name = 'keymatch-db'
 WHERE external_id = 'realtime-dev';

-- 2) Set jwt_secret chiffré (AES-128 GCM via REALTIME_ENC_KEY)
UPDATE _realtime.tenants
   SET jwt_secret = '$ESCAPED'
 WHERE external_id = 'db';

-- 3) Nettoyer un éventuel doublon "realtime-dev" résiduel
DELETE FROM _realtime.extensions WHERE tenant_external_id = 'realtime-dev';
DELETE FROM _realtime.tenants WHERE external_id = 'realtime-dev';

SET session_replication_role = 'origin';
COMMIT;

SELECT external_id, name, length(jwt_secret) AS jwt_secret_len
FROM _realtime.tenants;
SQL

echo ""
echo "✅ Tenant 'db' configuré"
echo ""
echo "Test rapide health endpoint (doit retourner 200) :"
ANON_KEY=$(grep ^NEXT_PUBLIC_SUPABASE_ANON_KEY ../postgrest-vps/.env 2>/dev/null | cut -d= -f2)
if [ -z "$ANON_KEY" ]; then
  echo "(note: ANON_KEY pas trouvée dans postgrest-vps/.env, skipping health test)"
else
  curl -sS -H "Host: db.keymatch-immo.fr" -H "Authorization: Bearer $ANON_KEY" \
    -o /dev/null -w "HTTP %{http_code}\n" \
    "http://127.0.0.1:4000/api/tenants/db/health"
fi
