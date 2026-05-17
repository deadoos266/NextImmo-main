#!/usr/bin/env bash
# Compare row counts entre Supabase prod et Postgres VPS local.
#
# Pour valider qu'un restore est complet AVANT de switcher DATABASE_URL.
#
# Usage : cd tools/postgres-vps && ./scripts/compare-rows.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "❌ .env manquant"; exit 1
fi
set -a; source "${ROOT_DIR}/.env"; set +a

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "❌ SUPABASE_DB_URL vide"; exit 1
fi

TABLES=$(docker compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tA -c \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")

if [[ -z "${TABLES}" ]]; then
  echo "❌ Aucune table dans Postgres VPS. Lance ./scripts/restore-vps.sh d'abord."
  exit 1
fi

echo "Comparing row counts Supabase prod ⇄ Postgres VPS local..."
echo ""
printf "%-35s %12s %12s %10s\n" "TABLE" "SUPABASE" "VPS" "DIFF"
printf "%-35s %12s %12s %10s\n" "$(printf '%.0s─' {1..35})" "$(printf '%.0s─' {1..12})" "$(printf '%.0s─' {1..12})" "$(printf '%.0s─' {1..10})"

TOTAL_SUPA=0; TOTAL_VPS=0; MISMATCHES=0

while IFS= read -r table; do
  [[ -z "${table}" ]] && continue
  # Supabase prod
  SUPA=$(docker run --rm postgres:16-alpine psql "${SUPABASE_DB_URL}" -tA -c "SELECT count(*) FROM public.\"${table}\"" 2>/dev/null || echo "ERR")
  # VPS local
  VPS=$(docker compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tA -c "SELECT count(*) FROM public.\"${table}\"" 2>/dev/null | tr -d '[:space:]' || echo "ERR")

  if [[ "${SUPA}" == "ERR" || "${VPS}" == "ERR" ]]; then
    printf "%-35s %12s %12s %10s\n" "${table}" "${SUPA}" "${VPS}" "?"
    MISMATCHES=$((MISMATCHES+1))
  else
    DIFF=$((VPS - SUPA))
    MARK=""
    if [[ "${DIFF}" != "0" ]]; then
      MARK=" ⚠"
      MISMATCHES=$((MISMATCHES+1))
    fi
    printf "%-35s %12s %12s %10s%s\n" "${table}" "${SUPA}" "${VPS}" "${DIFF}" "${MARK}"
    TOTAL_SUPA=$((TOTAL_SUPA + SUPA))
    TOTAL_VPS=$((TOTAL_VPS + VPS))
  fi
done <<< "${TABLES}"

echo ""
printf "%-35s %12s %12s %10s\n" "TOTAL" "${TOTAL_SUPA}" "${TOTAL_VPS}" "$((TOTAL_VPS - TOTAL_SUPA))"
echo ""
if [[ "${MISMATCHES}" -eq 0 ]]; then
  echo "✓ Toutes les tables ont le même nombre de rows. Migration complète."
else
  echo "⚠ ${MISMATCHES} tables avec différence. Inspecter avant switch DATABASE_URL."
  echo "   Diff acceptable < 1% si écrits ont eu lieu pendant le dump."
fi
