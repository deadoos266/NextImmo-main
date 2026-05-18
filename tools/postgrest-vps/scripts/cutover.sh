#!/usr/bin/env bash
# CUTOVER Phase 7e — flip NEXT_PUBLIC_SUPABASE_URL Supabase Cloud → VPS self-host.
#
# Procédure :
#   1. Backup /etc/keymatch-prod.env
#   2. Remplace les 3 vars Supabase (URL, ANON_KEY, SERVICE_ROLE_KEY)
#   3. Rebuild keymatch-next (NEXT_PUBLIC_* sont baked au build time, cf V97.39.31)
#   4. Restart container
#   5. Smoke test
#
# ROLLBACK : sudo cp /etc/keymatch-prod.env.bak.cutover /etc/keymatch-prod.env
#            && sudo docker compose -f tools/next-vps/docker-compose.yml up -d --build keymatch-next

set -euo pipefail

ENV_FILE="/etc/keymatch-prod.env"
BACKUP="${ENV_FILE}.bak.cutover-$(date +%Y%m%d-%H%M)"
PGRST_ENV="/opt/keymatch/NextImmo-main/tools/postgrest-vps/.env"

if [ ! -f "$PGRST_ENV" ]; then
  echo "❌ $PGRST_ENV introuvable."
  exit 1
fi

# Récupère les nouvelles clés depuis postgrest-vps/.env (générées par generate-keys.sh)
# Le script generate-keys.sh AFFICHE les clés mais ne les écrit nulle part automatiquement.
# On les regénère ici à la volée (HS256 sur POSTGREST_JWT_SECRET) — déterministe.

# shellcheck disable=SC1091
source "$PGRST_ENV"

if [ -z "${POSTGREST_JWT_SECRET:-}" ]; then
  echo "❌ POSTGREST_JWT_SECRET vide dans $PGRST_ENV"
  exit 1
fi

b64url() { openssl base64 -e -A | tr '+/' '-_' | tr -d '='; }

make_jwt() {
  local role="$1"
  local iat exp
  iat=$(date +%s)
  exp=$((iat + 60 * 60 * 24 * 365 * 10))
  local header='{"alg":"HS256","typ":"JWT"}'
  local payload
  payload=$(printf '{"role":"%s","iss":"keymatch-postgrest","iat":%d,"exp":%d}' "$role" "$iat" "$exp")
  local h_b64 p_b64 sig
  h_b64=$(printf '%s' "$header" | b64url)
  p_b64=$(printf '%s' "$payload" | b64url)
  sig=$(printf '%s.%s' "$h_b64" "$p_b64" \
    | openssl dgst -sha256 -hmac "$POSTGREST_JWT_SECRET" -binary \
    | b64url)
  printf '%s.%s.%s' "$h_b64" "$p_b64" "$sig"
}

ANON_KEY=$(make_jwt anon)
SERVICE_ROLE_KEY=$(make_jwt service_role)

echo "🔐 JWTs regénérés (anon + service_role)"
echo ""
echo "📋 Backup $ENV_FILE → $BACKUP"
sudo cp "$ENV_FILE" "$BACKUP"

echo "🔧 Flip env vars Supabase → VPS self-host"
sudo sed -i \
  -e "s|^NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=https://db.keymatch-immo.fr|" \
  -e "s|^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*|NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY|" \
  -e "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY|" \
  "$ENV_FILE"

echo "✅ env_file patché"
sudo grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=' "$ENV_FILE" | sed 's/=.*/=<set>/'

echo ""
echo "🚀 Rebuild keymatch-next (NEXT_PUBLIC_* sont baked au build time)"
cd /opt/keymatch/NextImmo-main/tools/next-vps
sudo docker compose up -d --build keymatch-next

echo ""
echo "⏳ Attendre healthcheck (40s) …"
sleep 40

echo ""
echo "🧪 Smoke test"
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" https://keymatch-immo.fr/api/health)
echo "→ /api/health : $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
  echo "⚠️  Health KO. Container logs :"
  sudo docker logs keymatch-next --tail 20
  echo ""
  echo "⏪ Rollback recommandé : sudo cp $BACKUP $ENV_FILE && sudo docker compose -f tools/next-vps/docker-compose.yml up -d --build keymatch-next"
  exit 1
fi

echo ""
echo "✅ CUTOVER TERMINÉ"
echo "   Backup : $BACKUP"
echo "   Pour rollback : sudo cp $BACKUP $ENV_FILE && cd /opt/keymatch/NextImmo-main/tools/next-vps && sudo docker compose up -d --build keymatch-next"
