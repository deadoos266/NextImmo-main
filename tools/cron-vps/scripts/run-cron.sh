#!/usr/bin/env bash
# Runner systemd pour les crons KeyMatch — Phase 9 plan migration OVH.
#
# Lancé par les unit `systemd/keymatch-cron-<name>.service` (générées par
# generate-systemd-units.sh à partir de cron-routes.tsv).
#
# Étapes :
#  1. Charge /etc/keymatch.env (CRON_SECRET + KEYMATCH_BASE_URL)
#  2. curl -X GET le endpoint avec Bearer auth, timeout 30s, retry 2
#  3. Log la réponse JSON + status code dans /var/log/keymatch-cron.log
#  4. Si status != 200 OU body contient error → exit 1 (systemd marquera failed)
#
# Usage : ./run-cron.sh <cron-name> <api-path>
#   ex : ./run-cron.sh health-check /api/cron/health-check

set -euo pipefail

CRON_NAME="${1:?usage: run-cron.sh <name> <path>}"
API_PATH="${2:?usage: run-cron.sh <name> <path>}"

# Charge env
if [[ -f /etc/keymatch.env ]]; then
  # shellcheck disable=SC1091
  set -a
  source /etc/keymatch.env
  set +a
fi

BASE_URL="${KEYMATCH_BASE_URL:-https://keymatch-immo.fr}"
SECRET="${CRON_SECRET:-}"
LOG_FILE="${KEYMATCH_CRON_LOG:-/var/log/keymatch-cron.log}"

if [[ -z "$SECRET" ]]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✗ CRON_SECRET manquant dans /etc/keymatch.env" | tee -a "$LOG_FILE" >&2
  exit 1
fi

URL="${BASE_URL}${API_PATH}"
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Curl avec timeout (5min) + retry 2x (1min entre)
RESPONSE_FILE=$(mktemp)
trap "rm -f $RESPONSE_FILE" EXIT

HTTP_CODE=$(curl -fsS -o "$RESPONSE_FILE" -w "%{http_code}" \
  -m 300 --retry 2 --retry-delay 60 --retry-connrefused \
  -H "Authorization: Bearer ${SECRET}" \
  "$URL" 2>&1 || echo "000")

BODY=$(cat "$RESPONSE_FILE" 2>/dev/null | head -c 2000 || echo "")

if [[ "$HTTP_CODE" == "200" ]]; then
  echo "[$TS] ✓ $CRON_NAME → ${HTTP_CODE} | $BODY" | tee -a "$LOG_FILE"
  exit 0
else
  echo "[$TS] ✗ $CRON_NAME → ${HTTP_CODE} | $BODY" | tee -a "$LOG_FILE" >&2
  exit 1
fi
