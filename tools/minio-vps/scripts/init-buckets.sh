#!/usr/bin/env bash
# Initialise les 7 buckets KeyMatch dans MinIO + policies.
#
# Normalement c'est fait automatiquement par le service `minio-init` du
# docker-compose.yml au premier `docker compose up -d`. Ce script est là
# pour re-run manuel si jamais on supprime un bucket par erreur ou pour
# vérifier que tout est en place.
#
# Idempotent : --ignore-existing.
#
# Usage : ./scripts/init-buckets.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

if [[ ! -f .env ]]; then
  echo "❌ .env manquant. cp .env.example .env et remplir." >&2
  exit 1
fi
# shellcheck disable=SC1091
source .env

MINIO_CONTAINER="${MINIO_CONTAINER:-keymatch-minio}"

# Vérifie que le container tourne
if ! docker ps --format '{{.Names}}' | grep -q "^${MINIO_CONTAINER}$"; then
  echo "❌ Container ${MINIO_CONTAINER} pas démarré. Lance d'abord :" >&2
  echo "   docker compose up -d" >&2
  exit 1
fi

# Lance les commandes mc dans un container éphémère lié au réseau MinIO
docker run --rm \
  --network keymatch-minio-net \
  -e MC_HOST_local="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
  minio/mc:latest /bin/sh -c "
    set -e
    echo '→ Crée les buckets (idempotent)'
    mc mb --ignore-existing local/avatars
    mc mb --ignore-existing local/annonces-photos
    mc mb --ignore-existing local/dossiers
    mc mb --ignore-existing local/baux
    mc mb --ignore-existing local/edl
    mc mb --ignore-existing local/quittances
    mc mb --ignore-existing local/messages-images
    mc mb --ignore-existing local/bug-screenshots

    echo '→ Applique policies'
    # Buckets publics (lecture anonyme via Caddy reverse-proxy)
    mc anonymous set download local/avatars
    mc anonymous set download local/annonces-photos
    # Buckets privés (accès via signed URLs seulement, comme Supabase RLS)
    mc anonymous set none local/dossiers
    mc anonymous set none local/baux
    mc anonymous set none local/edl
    mc anonymous set none local/quittances
    mc anonymous set none local/messages-images
    mc anonymous set none local/bug-screenshots

    echo '→ Vérifie'
    mc ls local
  "

echo "✓ Buckets initialisés"
