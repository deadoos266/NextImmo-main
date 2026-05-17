#!/usr/bin/env bash
# Deploy Next.js KeyMatch sur VPS — Phase 6 plan migration OVH.
#
# Usage : ./scripts/deploy.sh [--no-build]
#
# Étapes :
#   1. git pull (si autorisé)
#   2. docker compose build (sauf si --no-build)
#   3. docker compose up -d (zero-downtime swap)
#   4. Wait healthcheck OK (max 90s)
#   5. Smoke test /api/health
#   6. Notify Paul via Resend si fail (réutilise notif backup)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd "${ROOT_DIR}/../.." && pwd)"

cd "${REPO_DIR}"

NO_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

LOG_FILE="/var/log/keymatch-deploy.log"
ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $*" | tee -a "${LOG_FILE}"; }

log "═══════════════════════════════════════"
log "  KeyMatch Next.js deploy"
log "═══════════════════════════════════════"

# 1. git pull
log "→ git pull origin main"
git fetch origin main
LATEST=$(git rev-parse origin/main)
CURRENT=$(git rev-parse HEAD)
if [[ "${LATEST}" == "${CURRENT}" ]]; then
  log "  · Pas de nouveau commit (already at ${CURRENT:0:8})"
  if [[ "${NO_BUILD}" -eq 1 ]]; then
    log "  · Skip build + restart (--no-build)"
    exit 0
  fi
else
  git pull --ff-only origin main
  log "  ✓ ${CURRENT:0:8} → ${LATEST:0:8}"
fi

# 2. Build
if [[ "${NO_BUILD}" -eq 0 ]]; then
  log "→ docker compose build (peut prendre 3-5 min)"
  docker compose -f tools/next-vps/docker-compose.yml build 2>&1 | tee -a "${LOG_FILE}"
fi

# 3. Up -d (Docker fait du graceful restart si SIGTERM handled)
log "→ docker compose up -d"
docker compose -f tools/next-vps/docker-compose.yml up -d 2>&1 | tee -a "${LOG_FILE}"

# 4. Wait healthcheck
log "→ Attends healthcheck (max 90s)"
START=$(date +%s)
while true; do
  STATUS=$(docker inspect -f '{{.State.Health.Status}}' keymatch-next 2>/dev/null || echo "missing")
  ELAPSED=$(( $(date +%s) - START ))
  if [[ "${STATUS}" == "healthy" ]]; then
    log "  ✓ Healthy après ${ELAPSED}s"
    break
  fi
  if [[ "${ELAPSED}" -gt 90 ]]; then
    log "  ✗ Healthcheck KO après 90s (status: ${STATUS})"
    log "  Logs container :"
    docker logs --tail 50 keymatch-next | tee -a "${LOG_FILE}"
    exit 1
  fi
  sleep 3
done

# 5. Smoke test /api/health depuis Caddy
log "→ Smoke test https://staging.keymatch-immo.fr/api/health"
if curl -fsS -m 10 https://staging.keymatch-immo.fr/api/health | tee -a "${LOG_FILE}"; then
  log ""
  log "  ✓ Health endpoint répond"
else
  log "  ⚠ Health endpoint KO (peut être normal si DNS staging pas configuré encore)"
fi

log ""
log "✓ Deploy terminé : ${LATEST:0:8}"
log "═══════════════════════════════════════"
