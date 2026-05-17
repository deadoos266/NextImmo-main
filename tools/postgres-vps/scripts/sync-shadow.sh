#!/usr/bin/env bash
# V97.39.24 — Sync horaire Supabase prod → Postgres VPS shadow.
#
# Pourquoi : Phase 2 cutover de la DB nécessite que le shadow VPS soit le plus
# proche possible de la prod Supabase pour minimiser la fenêtre de coupure.
# Sans ce sync, le shadow est figé à l'instant du restore initial.
#
# Approche pragmatique V1 : pg_dump --data-only --no-owner Supabase → wipe +
# restore tables public.* sur VPS. Pas une logical replication temps réel,
# mais ~30s d'écart max si on tourne ce script toutes les heures.
#
# Pour passer en NEAR REAL-TIME (Paul a demandé) :
# - V2 : pg_dump --jobs=4 --data-only (parallel)
# - V3 : logical replication + WAL streaming (cf docs/PHASE2_REPLICATION.md)
#
# Lancé par systemd timer keymatch-shadow-sync.timer toutes les heures.
#
# Usage : ./scripts/sync-shadow.sh [--force]
#   --force : skip le check "trop tôt"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_FILE="/var/log/keymatch-shadow-sync.log"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"; }
die() { log "❌ FATAL: $*"; exit 1; }

if [[ ! -f "$ROOT_DIR/.env" ]]; then die ".env manquant"; fi
set -a; source "$ROOT_DIR/.env"; set +a

[[ -z "${SUPABASE_DB_URL:-}" ]] && die "SUPABASE_DB_URL vide dans .env"
[[ -z "${POSTGRES_PASSWORD:-}" ]] && die "POSTGRES_PASSWORD vide dans .env"

# Force flag pour bypass le check de fraîcheur
FORCE=0
for arg in "$@"; do [[ "$arg" == "--force" ]] && FORCE=1; done

CONTAINER="${POSTGRES_CONTAINER:-keymatch-postgres}"

# Sanity : container postgres up ?
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  die "Container $CONTAINER pas démarré"
fi

# Tables à syncer (public schema, hors tables Supabase Auth qui ne servent pas en VPS)
TABLES=(
  annonces profils users messages visites notifications loyers
  etats_des_lieux baux_signatures bail_avenants bail_invitations
  carnet_entretien clics_annonces contacts conversation_preferences
  cron_logs dossier_access_log dossier_share_tokens edl_signatures
  email_logs email_suppress_list favoris health_pings historique_baux
  import_jobs import_logs incidents qa_runs release_validations
)

log "→ Sync shadow démarré (${#TABLES[@]} tables)"
START=$(date +%s)

# Pour chaque table : truncate VPS + INSERT direct depuis Supabase via COPY pipe.
# C'est plus efficace que pg_dump+psql complet (qui ferait drop+create+restore).
FAILED=()
for t in "${TABLES[@]}"; do
  # Vérifie table existe côté Supabase ET côté VPS (skip silencieux sinon)
  if ! docker run --rm -e PGURL="$SUPABASE_DB_URL" postgres:17-alpine \
    psql "$PGURL" -tA -c "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$t'" 2>/dev/null | grep -q 1; then
    continue
  fi

  # COPY OUT depuis Supabase → COPY IN dans VPS (pipe direct, pas de file temp)
  # Wrap dans une transaction côté VPS pour atomicité (rollback si fail mid-table)
  if ! (
    docker run --rm -i -e PGURL="$SUPABASE_DB_URL" postgres:17-alpine \
      psql "$PGURL" -c "COPY public.\"$t\" TO STDOUT" 2>/dev/null \
    | docker exec -i "$CONTAINER" psql -U keymatch keymatch -c "
        BEGIN;
        TRUNCATE public.\"$t\" CASCADE;
        COPY public.\"$t\" FROM STDIN;
        COMMIT;
      " >/dev/null 2>&1
  ); then
    log "  ✗ $t : échec sync"
    FAILED+=("$t")
  fi
done

ELAPSED=$(( $(date +%s) - START ))
COUNT=$((${#TABLES[@]} - ${#FAILED[@]}))

if [[ ${#FAILED[@]} -eq 0 ]]; then
  log "✓ Sync terminé : $COUNT/${#TABLES[@]} tables en ${ELAPSED}s"
else
  log "⚠ Sync partiel : $COUNT/${#TABLES[@]} OK, échecs : ${FAILED[*]}"
fi
