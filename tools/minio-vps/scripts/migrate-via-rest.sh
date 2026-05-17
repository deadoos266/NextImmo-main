#!/usr/bin/env bash
# V97.39.26 — Migration Supabase Storage → MinIO via REST API.
#
# Alternative à migrate-from-supabase.sh qui exigeait des Supabase S3 Access
# Keys (= Paul devait les générer dans Supabase Dashboard). Cette version
# utilise SUPABASE_SERVICE_ROLE_KEY (déjà dispo dans .env) via REST API.
#
# Avantages :
#  - Zéro setup côté Paul (juste les clés que KeyMatch a déjà)
#  - Couvre les 8 buckets KeyMatch (public + privé)
#  - Idempotent : si fichier existe côté MinIO, skip
#  - Volume KeyMatch ~10-50 MB total → script termine en <2 min
#
# Pré-requis VPS :
#  - keymatch-minio container UP
#  - .env contient SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + MINIO_*
#  - jq installé
#
# Usage : bash scripts/migrate-via-rest.sh [bucket1 bucket2 ...]
# Sans args : migre les 8 buckets.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then echo "❌ .env manquant"; exit 1; fi
set -a; source .env; set +a

[[ -z "${SUPABASE_URL:-}" ]] && { echo "❌ SUPABASE_URL vide"; exit 1; }
[[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] && { echo "❌ SUPABASE_SERVICE_ROLE_KEY vide"; exit 1; }
[[ -z "${MINIO_ROOT_PASSWORD:-}" ]] && { echo "❌ MINIO_ROOT_PASSWORD vide"; exit 1; }
command -v jq >/dev/null || { echo "❌ jq absent"; exit 1; }

BUCKETS=("$@")
if [[ ${#BUCKETS[@]} -eq 0 ]]; then
  BUCKETS=(avatars annonces-photos dossiers baux edl quittances messages-images bug-screenshots)
fi

# Récursion : pour chaque bucket on liste récursivement.
# Supabase REST API : POST /storage/v1/object/list/<bucket>
# Body : { "prefix": "<dir>", "limit": N, "offset": 0 }
# Réponse : array de { name, id, ... }
#   - Si `id == null` → c'est un DOSSIER, on doit récurser dedans
#   - Sinon → c'est un fichier, on download + upload MinIO

# Charge le mc client une fois pour éviter multiples docker run startup
MC_ALIAS="local"
MC_CMD="docker run --rm --network keymatch-minio-net \
  -e MC_HOST_local=http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000 \
  minio/mc:latest"

# Fonction récursive pour walker tous les fichiers d'un bucket
walk_supabase_bucket() {
  local bucket="$1"
  local prefix="$2"
  local depth="${3:-0}"
  local max_depth=5  # safety

  if [[ "$depth" -gt "$max_depth" ]]; then
    echo "  ⚠ max depth atteint sur $bucket/$prefix"
    return
  fi

  local resp
  resp=$(curl -sS -X POST \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    "${SUPABASE_URL}/storage/v1/object/list/${bucket}" \
    -d "$(jq -nc --arg p "$prefix" '{prefix:$p,limit:1000,offset:0,sortBy:{column:"name",order:"asc"}}')" 2>&1)

  if echo "$resp" | head -c 1 | grep -qv '\['; then
    echo "  · Bucket $bucket : pas accessible ($(echo "$resp" | head -c 100))"
    return
  fi

  # Items array — chaque item a name + id (null si dossier)
  local nb_items
  nb_items=$(echo "$resp" | jq 'length')
  if [[ "$nb_items" == "0" ]]; then return; fi

  echo "$resp" | jq -c '.[]' | while IFS= read -r item; do
    local name id full_path
    name=$(echo "$item" | jq -r '.name')
    id=$(echo "$item" | jq -r '.id')
    if [[ "$prefix" == "" ]]; then
      full_path="$name"
    else
      full_path="$prefix/$name"
    fi

    if [[ "$id" == "null" ]]; then
      # Dossier : récursion
      walk_supabase_bucket "$bucket" "$full_path" "$((depth + 1))"
    else
      # Fichier : download + upload MinIO
      migrate_file "$bucket" "$full_path"
    fi
  done
}

# Migration d'1 fichier
migrate_file() {
  local bucket="$1"
  local path="$2"

  # Skip si déjà dans MinIO (idempotent)
  if $MC_CMD stat "$MC_ALIAS/$bucket/$path" >/dev/null 2>&1; then
    echo "    · $bucket/$path déjà dans MinIO, skip"
    return
  fi

  # Download depuis Supabase
  local temp_file
  temp_file=$(mktemp)
  trap "rm -f $temp_file" RETURN

  local http_code
  http_code=$(curl -sS -o "$temp_file" -w "%{http_code}" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    "${SUPABASE_URL}/storage/v1/object/${bucket}/${path}" 2>&1)

  if [[ "$http_code" != "200" ]]; then
    echo "    ✗ $bucket/$path : HTTP $http_code"
    rm -f "$temp_file"
    return
  fi

  local size
  size=$(stat -c%s "$temp_file" 2>/dev/null || stat -f%z "$temp_file")
  if [[ "$size" -eq 0 ]]; then
    echo "    ✗ $bucket/$path : 0 bytes (skip)"
    rm -f "$temp_file"
    return
  fi

  # Upload via mc cp (stdin) — utilise pipe pour streaming
  if cat "$temp_file" | $MC_CMD pipe "$MC_ALIAS/$bucket/$path" >/dev/null 2>&1; then
    echo "    ✓ $bucket/$path ($size bytes)"
  else
    echo "    ✗ $bucket/$path : upload MinIO échoué"
  fi
  rm -f "$temp_file"
}

# Main loop
TOTAL_OK=0
TOTAL_FAIL=0
for bucket in "${BUCKETS[@]}"; do
  echo ""
  echo "═══ $bucket ═══"
  walk_supabase_bucket "$bucket" ""
done

echo ""
echo "✓ Migration terminée. Vérifie avec :"
echo "  $MC_CMD ls $MC_ALIAS --recursive | head -30"
