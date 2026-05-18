#!/usr/bin/env bash
# Génère ANON_KEY + SERVICE_ROLE_KEY (JWTs HS256) signés avec POSTGREST_JWT_SECRET.
# V97.39.33 Phase 7 — compat Supabase pour @supabase/supabase-js sans changer le code.
#
# Usage : sudo bash scripts/generate-keys.sh
# Lit POSTGREST_JWT_SECRET depuis .env du dossier courant.
# Affiche les 2 clés à recopier dans /etc/keymatch-prod.env.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ .env introuvable. Copie .env.example → .env et remplis-le."
  exit 1
fi

# shellcheck disable=SC1091
source .env

if [ -z "${POSTGREST_JWT_SECRET:-}" ] || [ ${#POSTGREST_JWT_SECRET} -lt 32 ]; then
  echo "❌ POSTGREST_JWT_SECRET manquant ou < 32 chars dans .env"
  exit 1
fi

# Helper HS256 JWT en pur bash + openssl
b64url() {
  openssl base64 -e -A | tr '+/' '-_' | tr -d '='
}

make_jwt() {
  local role="$1"
  # exp : 10 ans
  local iat exp
  iat=$(date +%s)
  exp=$((iat + 60 * 60 * 24 * 365 * 10))

  local header_json='{"alg":"HS256","typ":"JWT"}'
  local payload_json
  payload_json=$(printf '{"role":"%s","iss":"keymatch-postgrest","iat":%d,"exp":%d}' "$role" "$iat" "$exp")

  local header_b64 payload_b64 sig
  header_b64=$(printf '%s' "$header_json" | b64url)
  payload_b64=$(printf '%s' "$payload_json" | b64url)

  sig=$(printf '%s.%s' "$header_b64" "$payload_b64" \
    | openssl dgst -sha256 -hmac "$POSTGREST_JWT_SECRET" -binary \
    | b64url)

  printf '%s.%s.%s\n' "$header_b64" "$payload_b64" "$sig"
}

ANON_KEY=$(make_jwt anon)
SERVICE_ROLE_KEY=$(make_jwt service_role)

echo "================================================================"
echo "✅ Clés générées (signées HS256 avec POSTGREST_JWT_SECRET)"
echo "================================================================"
echo ""
echo "À recopier dans /etc/keymatch-prod.env (variables existantes Supabase) :"
echo ""
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY"
echo ""
echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
echo ""
echo "================================================================"
echo "Vérif rapide (décode payload) :"
echo "$ANON_KEY" | cut -d. -f2 | sed 's/-/+/g; s/_/\//g' | base64 -d 2>/dev/null || true
echo ""
echo "$SERVICE_ROLE_KEY" | cut -d. -f2 | sed 's/-/+/g; s/_/\//g' | base64 -d 2>/dev/null || true
echo ""
