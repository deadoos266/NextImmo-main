#!/usr/bin/env bash
# Backup quotidien Postgres VPS → cloud offsite + rotation.
#
# Lancé par systemd timer keymatch-backup.timer à 03:00 UTC tous les jours
# (= 04:00 Paris hiver / 05:00 Paris été).
#
# Étapes :
#   1. pg_dump du Postgres VPS (container keymatch-postgres)
#   2. gzip + checksum SHA256
#   3. Upload vers cloud (B2 ou OVH Object Storage selon config)
#   4. Rotation locale + remote : 7 daily + 4 weekly (lundis dans 30j)
#      + 12 monthly (1er du mois dans 365j)
#   5. Si fail à n'importe quelle étape → email Paul via Resend (non bloquant)
#
# Pré-requis sur le VPS :
#   - rclone installé (apt install rclone) — config dans /home/ubuntu/.config/rclone/rclone.conf
#   - container keymatch-postgres up
#   - .env contient POSTGRES_USER, POSTGRES_DB, POSTGRES_PASSWORD, BACKUP_NOTIFY_EMAIL, RESEND_API_KEY

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_FILE="/var/log/keymatch-backup.log"

# ─── Helpers ───────────────────────────────────────────────────────────────
log() { echo "[$(date +%Y-%m-%dT%H:%M:%S)] $*" | tee -a "${LOG_FILE}"; }
die() { log "❌ FATAL: $*"; notify_fail "$*"; exit 1; }

notify_fail() {
  local error="$1"
  if [[ -z "${RESEND_API_KEY:-}" || -z "${BACKUP_NOTIFY_EMAIL:-}" ]]; then
    log "⚠ Pas de notification (RESEND_API_KEY ou BACKUP_NOTIFY_EMAIL manquant)"
    return
  fi
  # V97.39.22 — V97.39.19 utilisait `node -e` mais Node n'est pas installé
  # sur le VPS de base. On utilise jq (portable, présent sur Ubuntu 24.04).
  local today
  today=$(date +%Y-%m-%d)
  local payload
  if ! payload=$(jq -nc \
    --arg from "KeyMatch Ops <noreply@keymatch-immo.fr>" \
    --arg to "${BACKUP_NOTIFY_EMAIL}" \
    --arg subject "⚠ Backup KeyMatch FAILED (${today})" \
    --arg text "${error}\\n\\nLog: ${LOG_FILE}" \
    '{from:$from,to:$to,subject:$subject,text:$text}' 2>/dev/null); then
    log "⚠ jq absent — pas de notif email"
    return
  fi
  curl -sS -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "${payload}" \
    > /dev/null 2>&1 || true
}

# ─── Source .env ──────────────────────────────────────────────────────────
if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  die ".env manquant à ${ROOT_DIR}/.env"
fi
set -a; source "${ROOT_DIR}/.env"; set +a

# ─── Setup ────────────────────────────────────────────────────────────────
TIMESTAMP="$(date +%Y-%m-%d-%H%M)"
TODAY="$(date +%Y-%m-%d)"
BACKUPS_DIR="${ROOT_DIR}/backups"
mkdir -p "${BACKUPS_DIR}"
DUMP_FILE="${BACKUPS_DIR}/keymatch-postgres-${TIMESTAMP}.sql.gz"
SHA_FILE="${DUMP_FILE}.sha256"

log "→ Backup démarré : ${DUMP_FILE}"

# ─── 1. pg_dump ───────────────────────────────────────────────────────────
# V97.39.22 — dual mode :
#   - Si SUPABASE_DB_URL set → dump direct Supabase via container postgres temp
#     (utile AVANT Phase 2 cutover : on backup la prod actuelle)
#   - Sinon → dump container local keymatch-postgres (Phase 2 active)
# Permet à Paul d'avoir des backups DÈS AUJOURD'HUI sans avoir migré la DB.
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  log "→ pg_dump distant via SUPABASE_DB_URL (Phase 8 pre-cutover)"
  # Container postgres temp jetable, on lui passe l'URL via env pour pas
  # leak le password dans `ps`. --rm = cleanup auto. Tag :16-alpine match
  # la version cible Phase 2.
  docker run --rm -i \
    -e PGURL="${SUPABASE_DB_URL}" \
    postgres:16-alpine \
    sh -c 'pg_dump --no-owner --no-privileges --no-comments "$PGURL"' \
    2>>"${LOG_FILE}" | gzip -9 > "${DUMP_FILE}" \
    || die "pg_dump distant Supabase échoué"
else
  log "→ pg_dump du container local keymatch-postgres (Phase 2 active)"
  docker compose -f "${ROOT_DIR}/docker-compose.yml" exec -T postgres \
    pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
    --no-owner --no-privileges --no-comments \
    2>>"${LOG_FILE}" | gzip -9 > "${DUMP_FILE}" \
    || die "pg_dump container local échoué (Phase 2 inactive ? Set SUPABASE_DB_URL pour backup Supabase à la place)"
fi

SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
LINES=$(zcat "${DUMP_FILE}" | wc -l)
log "  ✓ ${DUMP_FILE} (${SIZE}, ${LINES} lignes SQL)"

# Sanity check : taille minimale > 1 KB
SIZE_BYTES=$(stat -c%s "${DUMP_FILE}" 2>/dev/null || stat -f%z "${DUMP_FILE}")
if [[ "${SIZE_BYTES}" -lt 1024 ]]; then
  die "Dump trop petit (<1KB), probablement vide"
fi

# ─── 2. Checksum ──────────────────────────────────────────────────────────
sha256sum "${DUMP_FILE}" > "${SHA_FILE}"
log "  ✓ SHA256 : $(cat "${SHA_FILE}" | cut -d' ' -f1)"

# ─── 3. Upload offsite ────────────────────────────────────────────────────
if command -v rclone >/dev/null 2>&1 && [[ -n "${RCLONE_REMOTE:-}" ]]; then
  log "→ Upload vers ${RCLONE_REMOTE}/postgres/"
  rclone copy "${DUMP_FILE}" "${RCLONE_REMOTE}/postgres/" --progress 2>>"${LOG_FILE}" \
    || die "rclone upload échoué"
  rclone copy "${SHA_FILE}" "${RCLONE_REMOTE}/postgres/" 2>>"${LOG_FILE}" || true
  log "  ✓ Upload offsite OK"
else
  log "⚠ Pas de RCLONE_REMOTE configuré ou rclone absent — backup local seulement"
fi

# ─── 3b. MinIO data (Phase 3 — si présent) ────────────────────────────────
# V97.39.20 — tarball le volume MinIO si présent. Optionnel : marche même
# si Phase 3 pas encore activée (skip silencieusement).
#
# ⚠ Note : on tar le volume "hot" sans arrêter MinIO. MinIO commit chaque
# objet de façon atomique (rename), donc on ne risque pas un fichier
# corrompu sur disque. MAIS un upload multipart EN COURS au moment du tar
# se retrouve avec des chunks partiels dans le tarball. Au restore, ils
# seront ignorés (MinIO les considère comme uploads abandonnés > 7j).
# Pour zéro risque : ajouter `docker compose -f tools/minio-vps/docker-compose.yml stop minio`
# avant le tar et `start minio` après. Trade-off : 30s d'indisponibilité
# uploads/downloads chaque nuit. Vu le volume KeyMatch (~50 ops/jour), on
# accepte le risque actuel.
MINIO_DATA_DIR="${MINIO_DATA_DIR:-/srv/keymatch/minio-data}"
if [[ -d "${MINIO_DATA_DIR}" ]]; then
  MINIO_FILE="${BACKUPS_DIR}/keymatch-minio-${TIMESTAMP}.tar.gz"
  log "→ Tarball MinIO data (${MINIO_DATA_DIR} → ${MINIO_FILE})"
  if tar -czf "${MINIO_FILE}" -C "$(dirname "${MINIO_DATA_DIR}")" "$(basename "${MINIO_DATA_DIR}")" 2>>"${LOG_FILE}"; then
    MINIO_SIZE=$(du -h "${MINIO_FILE}" | cut -f1)
    log "  ✓ ${MINIO_FILE} (${MINIO_SIZE})"
    sha256sum "${MINIO_FILE}" > "${MINIO_FILE}.sha256"
    if command -v rclone >/dev/null 2>&1 && [[ -n "${RCLONE_REMOTE:-}" ]]; then
      rclone copy "${MINIO_FILE}" "${RCLONE_REMOTE}/minio/" --progress 2>>"${LOG_FILE}" \
        && rclone copy "${MINIO_FILE}.sha256" "${RCLONE_REMOTE}/minio/" 2>>"${LOG_FILE}" \
        && log "  ✓ MinIO upload offsite OK" \
        || log "⚠ MinIO upload offsite échoué (non bloquant)"
    fi
  else
    log "⚠ tar MinIO échoué (non bloquant, on continue)"
  fi
else
  log "  · MinIO data dir absent (${MINIO_DATA_DIR}) — skip (Phase 3 pas activée)"
fi

# ─── 4. Rotation locale ────────────────────────────────────────────────────
# Garde : 7 derniers daily + 4 weekly (lundi) + 12 monthly (1er du mois)
log "→ Rotation backups locaux (7d / 4w / 12m)"
cd "${BACKUPS_DIR}"

# Daily : supprime > 7 jours, sauf weekly/monthly
# Couvre les 2 types : pg dumps + MinIO tarballs
find . \( -name "keymatch-postgres-*.sql.gz" -o -name "keymatch-minio-*.tar.gz" \) -mtime +7 -print0 | while IFS= read -r -d '' f; do
  date_str=$(echo "$f" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')
  if [[ -n "${date_str}" ]]; then
    day_of_week=$(date -d "${date_str}" +%u 2>/dev/null || date -j -f "%Y-%m-%d" "${date_str}" +%u 2>/dev/null || echo "0")
    day_of_month=$(echo "${date_str}" | cut -d- -f3)
    age_days=$(( ($(date +%s) - $(date -d "${date_str}" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "${date_str}" +%s 2>/dev/null || echo "0")) / 86400 ))

    # Garde si lundi (weekly) ET <30j, OU 1er du mois (monthly) ET <365j
    if [[ "${day_of_week}" == "1" && "${age_days}" -lt 30 ]]; then continue; fi
    if [[ "${day_of_month}" == "01" && "${age_days}" -lt 365 ]]; then continue; fi
    rm -f "$f" "${f}.sha256"
    log "  - Purgé ${f} (age ${age_days}j)"
  fi
done

# ─── 5. Rotation distante (rclone) ─────────────────────────────────────────
if command -v rclone >/dev/null 2>&1 && [[ -n "${RCLONE_REMOTE:-}" ]]; then
  log "→ Rotation distante (>30 daily, >365 monthly)"
  rclone delete "${RCLONE_REMOTE}/postgres/" --min-age 30d \
    --include "keymatch-postgres-*-*-*-*.sql.gz" 2>>"${LOG_FILE}" || true
fi

log "✓ Backup ${TIMESTAMP} terminé OK"
echo ""
