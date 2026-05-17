#!/usr/bin/env bash
# Test mensuel : restore le dernier backup dans un container temporaire pour
# vérifier qu'il est récupérable. Notifie Paul si fail.
#
# Lancé par cron mensuel /etc/cron.d/keymatch-backup-test (1er du mois 4h).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_FILE="/var/log/keymatch-backup-test.log"

log() { echo "[$(date +%Y-%m-%dT%H:%M:%S)] $*" | tee -a "${LOG_FILE}"; }
die() {
  log "❌ $*"
  # V97.39.22 — jq au lieu de node (Node pas installé sur VPS de base)
  if [[ -n "${RESEND_API_KEY:-}" && -n "${BACKUP_NOTIFY_EMAIL:-}" ]] && command -v jq >/dev/null; then
    local payload
    payload=$(jq -nc \
      --arg from "KeyMatch Ops <noreply@keymatch-immo.fr>" \
      --arg to "${BACKUP_NOTIFY_EMAIL}" \
      --arg subject "⚠ Backup KeyMatch — restore-test FAILED" \
      --arg text "Restore test failed: $*\\n\\nLog: ${LOG_FILE}" \
      '{from:$from,to:$to,subject:$subject,text:$text}' 2>/dev/null) && \
    curl -sS -X POST https://api.resend.com/emails \
      -H "Authorization: Bearer ${RESEND_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "${payload}" > /dev/null 2>&1 || true
  fi
  exit 1
}

if [[ ! -f "${ROOT_DIR}/.env" ]]; then die ".env manquant"; fi
set -a; source "${ROOT_DIR}/.env"; set +a

# Trouve le dernier backup
LAST_BACKUP=$(ls -t "${ROOT_DIR}/backups/keymatch-postgres-"*.sql.gz 2>/dev/null | head -1 || true)
if [[ -z "${LAST_BACKUP}" ]]; then
  die "Aucun backup trouvé dans ${ROOT_DIR}/backups/"
fi

log "→ Test restore : ${LAST_BACKUP}"

# Vérifie SHA256 avant de restorer
SHA_FILE="${LAST_BACKUP}.sha256"
if [[ -f "${SHA_FILE}" ]]; then
  if ! sha256sum -c "${SHA_FILE}" > /dev/null 2>&1; then
    die "SHA256 mismatch sur ${LAST_BACKUP} — backup corrompu"
  fi
  log "  ✓ SHA256 OK"
fi

# Spawn un Postgres temporaire pour tester
TEMP_CONTAINER="keymatch-postgres-test-$$"
TEMP_PASSWORD="$(openssl rand -hex 16)"
log "→ Spawn container test ${TEMP_CONTAINER}"

docker run -d --rm \
  --name "${TEMP_CONTAINER}" \
  -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD="${TEMP_PASSWORD}" \
  -e POSTGRES_DB=test \
  postgres:16-alpine >/dev/null

# Trap pour cleanup même en cas d'erreur
trap "docker stop ${TEMP_CONTAINER} > /dev/null 2>&1 || true" EXIT

# Wait postgres ready (max 30s)
for i in {1..30}; do
  if docker exec "${TEMP_CONTAINER}" pg_isready -U test > /dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$i" -eq 30 ]]; then die "Container test pas prêt après 30s"; fi
done
log "  ✓ Container test prêt"

# Restore le backup
log "→ Restore ${LAST_BACKUP}"
zcat "${LAST_BACKUP}" | docker exec -i "${TEMP_CONTAINER}" \
  psql -U test -d test --set ON_ERROR_STOP=on > /dev/null 2>&1 \
  || die "Restore échoué"
log "  ✓ Restore OK"

# Vérifie qu'il y a au moins quelques rows dans annonces (sanity check)
ROW_COUNT=$(docker exec "${TEMP_CONTAINER}" psql -U test -d test -tA -c \
  "SELECT count(*) FROM annonces" 2>/dev/null | tr -d '[:space:]' || echo "0")
if [[ "${ROW_COUNT}" -lt 1 ]]; then
  log "⚠ 0 rows dans annonces — backup probablement vide ou test précoce avant données"
fi

TABLES=$(docker exec "${TEMP_CONTAINER}" psql -U test -d test -tA -c \
  "SELECT count(*) FROM pg_tables WHERE schemaname='public'" 2>/dev/null | tr -d '[:space:]')
log "  ✓ ${TABLES} tables restorées, ${ROW_COUNT} annonces"

# Cleanup
docker stop "${TEMP_CONTAINER}" > /dev/null
trap - EXIT

log "✓ Restore test OK : ${LAST_BACKUP} est récupérable"
echo ""
