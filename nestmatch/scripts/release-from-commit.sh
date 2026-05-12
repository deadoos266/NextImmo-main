#!/usr/bin/env bash
# V97.25 — Crée une row release_validations pour le commit HEAD
#
# Usage :
#   ./scripts/release-from-commit.sh             # commit HEAD, checks vides
#   ./scripts/release-from-commit.sh HEAD~1      # autre ref git
#   CHECKS_FILE=/tmp/checks.txt ./scripts/release-from-commit.sh
#
# Si CHECKS_FILE est défini, le fichier doit contenir 1 check par ligne.
# Sinon, on génère 1 seul check par défaut "Tester ce commit en prod".
#
# Auth : utilise SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (depuis .env.local).
# Le service_role bypass RLS donc on insère direct sans NextAuth.
#
# Effet secondaire : INSERT une notification cloche pour Paul (admin) pour
# qu'il voie immédiatement la nouvelle release dans la cloche du site.

set -euo pipefail

REF="${1:-HEAD}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Charge SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY depuis .env.local
ENV_FILE="${REPO_DIR}/.env.local"
if [ ! -f "${ENV_FILE}" ]; then
  echo "❌ .env.local introuvable à ${ENV_FILE}" >&2
  exit 1
fi
SUPABASE_URL=$(grep -E "^NEXT_PUBLIC_SUPABASE_URL=" "${ENV_FILE}" | head -1 | cut -d= -f2-)
SERVICE_KEY=$(grep -E "^SUPABASE_SERVICE_ROLE_KEY=" "${ENV_FILE}" | head -1 | cut -d= -f2-)
if [ -z "${SUPABASE_URL}" ] || [ -z "${SERVICE_KEY}" ]; then
  echo "❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local" >&2
  exit 1
fi

# Extrait les infos du commit
COMMIT_SHA=$(git rev-parse "${REF}")
COMMIT_SHORT=$(git rev-parse --short=8 "${REF}")
COMMIT_TITLE=$(git log -1 --format=%s "${REF}")
COMMIT_BODY=$(git log -1 --format=%B "${REF}" | tail -n +2)

# Truncate body à 4500 chars (DB limit 5000 avec marge)
COMMIT_BODY="${COMMIT_BODY:0:4500}"

# Construit la liste de checks
CHECKS_JSON='[]'
if [ -n "${CHECKS_FILE:-}" ] && [ -f "${CHECKS_FILE}" ]; then
  CHECKS_JSON=$(node -e "
    const fs = require('fs');
    const lines = fs.readFileSync('${CHECKS_FILE}', 'utf-8').split('\n').filter(l => l.trim().length > 0);
    const checks = lines.map((label, i) => ({
      id: 'check-' + (i + 1),
      label: label.slice(0, 300),
      status: 'pending',
    }));
    console.log(JSON.stringify(checks));
  ")
else
  CHECKS_JSON='[{"id":"check-1","label":"Tester ce commit en prod après déploiement Vercel","status":"pending"}]'
fi

# Construit le payload JSON via node (échappement safe)
PAYLOAD=$(node -e "
  const payload = {
    commit_sha: '${COMMIT_SHA}',
    commit_short: '${COMMIT_SHORT}',
    commit_title: process.env.TITLE,
    commit_body: process.env.BODY,
    checks: ${CHECKS_JSON},
    status: 'pending',
  };
  console.log(JSON.stringify(payload));
" TITLE="${COMMIT_TITLE}" BODY="${COMMIT_BODY}")

# INSERT release_validations
echo "→ INSERT release_validations pour ${COMMIT_SHORT}..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SUPABASE_URL}/rest/v1/release_validations" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "${PAYLOAD}")
HTTP_CODE=$(echo "${RESPONSE}" | tail -n 1)
BODY=$(echo "${RESPONSE}" | sed '$d')

if [ "${HTTP_CODE}" = "409" ]; then
  echo "⚠ Release déjà existante pour ${COMMIT_SHORT}, skip."
  exit 0
fi
if [ "${HTTP_CODE}" != "201" ]; then
  echo "❌ INSERT release_validations failed (HTTP ${HTTP_CODE}):" >&2
  echo "${BODY}" >&2
  exit 1
fi

RELEASE_ID=$(echo "${BODY}" | node -e "
  let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{
    const arr=JSON.parse(s);console.log(arr[0]?.id||'')
  })
")
echo "✓ Release créée : ${RELEASE_ID}"

# INSERT notification cloche pour Paul (user_email tic3467@gmail.com d'après MEMORY).
# Si l'utilisateur veut un autre destinataire, set NOTIF_TO en env.
NOTIF_TO="${NOTIF_TO:-tic3467@gmail.com}"
NOTIF_PAYLOAD=$(node -e "
  console.log(JSON.stringify({
    user_email: process.env.TO,
    type: 'release_pending',
    title: 'Nouvelle release à valider',
    body: process.env.TITLE,
    href: '/admin/releases',
    related_id: process.env.RID,
    lu: false,
  }));
" TO="${NOTIF_TO}" TITLE="${COMMIT_TITLE}" RID="${RELEASE_ID}")

echo "→ INSERT notification cloche pour ${NOTIF_TO}..."
NOTIF_RESPONSE=$(curl -s -w "%{http_code}" -X POST "${SUPABASE_URL}/rest/v1/notifications" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "${NOTIF_PAYLOAD}")
NOTIF_CODE="${NOTIF_RESPONSE: -3}"
if [ "${NOTIF_CODE}" = "201" ]; then
  echo "✓ Notification cloche envoyée à ${NOTIF_TO}"
else
  echo "⚠ Notification non envoyée (HTTP ${NOTIF_CODE}), pas bloquant."
fi

echo ""
echo "──────────────────────────────────────────"
echo "  Release ${COMMIT_SHORT} prête à valider"
echo "  https://keymatch-immo.fr/admin/releases"
echo "──────────────────────────────────────────"
