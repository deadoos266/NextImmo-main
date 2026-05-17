#!/usr/bin/env bash
# Migre tous les fichiers Supabase Storage vers MinIO local.
#
# Idempotent : utilise rclone qui skip si fichier identique (size + mtime).
# Peut être re-run plusieurs fois pendant la fenêtre de dual-write avant
# le cutover.
#
# Pré-requis :
#   - rclone installé (apt install rclone — ou via tools/postgres-vps/scripts/install-backup.sh)
#   - MinIO container up
#   - .env complet (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MINIO creds)
#
# Usage : ./scripts/migrate-from-supabase.sh [bucket1 bucket2 ...]
# Sans args : migre les 7 buckets. Avec args : seulement ceux listés.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

if [[ ! -f .env ]]; then
  echo "❌ .env manquant" >&2
  exit 1
fi
# shellcheck disable=SC1091
source .env

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "❌ SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env" >&2
  echo "   Récupère depuis nestmatch/.env.local" >&2
  exit 1
fi

if ! command -v rclone >/dev/null; then
  echo "❌ rclone manquant. Install :" >&2
  echo "   curl -fsSL https://rclone.org/install.sh | bash" >&2
  exit 1
fi

BUCKETS=("$@")
if [[ ${#BUCKETS[@]} -eq 0 ]]; then
  BUCKETS=(avatars annonces-photos dossiers baux edl quittances messages-images bug-screenshots)
fi

# Configure remotes rclone dans un fichier temp (pas dans ~/.config/rclone)
RCLONE_CONF=$(mktemp)
trap "rm -f $RCLONE_CONF" EXIT

# Supabase Storage est S3-compatible si tu actives le mode S3 (gratuit).
# Sinon, on utilise l'API HTTP Storage Supabase via rclone-http (limitations).
# La V1 utilise l'option S3 native Supabase.
# Cf https://supabase.com/docs/guides/storage/s3/authentication
SUPABASE_REGION="${SUPABASE_REGION:-eu-west-2}"
SUPABASE_S3_ENDPOINT="${SUPABASE_URL}/storage/v1/s3"

cat > "$RCLONE_CONF" <<EOF
[supabase]
type = s3
provider = Other
access_key_id = ${SUPABASE_S3_ACCESS_KEY:-}
secret_access_key = ${SUPABASE_S3_SECRET_KEY:-}
endpoint = ${SUPABASE_S3_ENDPOINT}
region = ${SUPABASE_REGION}
force_path_style = true

[minio]
type = s3
provider = Minio
access_key_id = ${MINIO_ROOT_USER}
secret_access_key = ${MINIO_ROOT_PASSWORD}
endpoint = http://localhost:9000
region = us-east-1
force_path_style = true
EOF

if [[ -z "${SUPABASE_S3_ACCESS_KEY:-}" || -z "${SUPABASE_S3_SECRET_KEY:-}" ]]; then
  echo "❌ SUPABASE_S3_ACCESS_KEY + SUPABASE_S3_SECRET_KEY requis" >&2
  echo "   Génère depuis Supabase Dashboard → Storage → S3 Access Keys" >&2
  exit 1
fi

FAILED=()
SKIPPED=()
for bucket in "${BUCKETS[@]}"; do
  echo ""
  echo "════════════════════════════════════════════════"
  echo "  Migration bucket: $bucket"
  echo "════════════════════════════════════════════════"

  # Compte rows AVANT — utilisé aussi pour détecter les buckets inexistants.
  # Si lsf retourne erreur ET 0 lignes, on suppose que le bucket n'existe pas
  # côté Supabase (cas normal si KeyMatch ne l'a jamais créé : ex bug-screenshots
  # peut ne pas exister sur tous les environnements).
  if ! count_src=$(rclone --config "$RCLONE_CONF" lsf "supabase:$bucket" -R 2>&1 | wc -l); then
    count_src=0
  fi
  # Test d'existence explicite : si lsd échoue ou retourne 0 → skip
  if ! rclone --config "$RCLONE_CONF" lsd "supabase:$bucket" >/dev/null 2>&1; then
    echo "  · Bucket $bucket inexistant côté Supabase → skip"
    SKIPPED+=("$bucket")
    continue
  fi
  echo "  Source ($bucket) : $count_src fichiers"

  # rclone copy : skip si déjà identique (size + mtime)
  if rclone --config "$RCLONE_CONF" copy \
      "supabase:$bucket" "minio:$bucket" \
      --progress \
      --transfers 4 \
      --checkers 8 \
      --retries 3; then
    count_dst=$(rclone --config "$RCLONE_CONF" lsf "minio:$bucket" -R 2>/dev/null | wc -l || echo 0)
    echo "  ✓ Bucket $bucket : $count_src → $count_dst (diff=$((count_src - count_dst)))"
    if [[ "$count_src" != "$count_dst" ]]; then
      echo "  ⚠ delta de comptage détecté (peut être normal si fichiers ajoutés pendant la copie)" >&2
    fi
  else
    echo "  ✗ Échec migration bucket $bucket" >&2
    FAILED+=("$bucket")
  fi
done

echo ""
echo "════════════════════════════════════════════════"
PROCESSED=$(( ${#BUCKETS[@]} - ${#SKIPPED[@]} ))
if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo "  ✓ Migration : ${PROCESSED}/${#BUCKETS[@]} buckets traités"
  if [[ ${#SKIPPED[@]} -gt 0 ]]; then
    echo "  · Skippés (inexistants Supabase) : ${SKIPPED[*]}"
  fi
else
  echo "  ✗ Échecs : ${FAILED[*]}"
  if [[ ${#SKIPPED[@]} -gt 0 ]]; then
    echo "  · Skippés (inexistants Supabase) : ${SKIPPED[*]}"
  fi
  exit 1
fi
echo "════════════════════════════════════════════════"
