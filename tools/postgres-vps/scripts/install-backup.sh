#!/usr/bin/env bash
# Installe les systemd units backup + restore-test sur le VPS.
#
# À lancer 1 seule fois après que Postgres VPS est setup (cf README).
#
# Usage : sudo ./scripts/install-backup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "❌ Lance avec sudo (besoin pour écrire /etc/systemd/)" >&2
  exit 1
fi

# Installe rclone si pas déjà
if ! command -v rclone >/dev/null 2>&1; then
  echo "→ Installe rclone"
  curl -fsSL https://rclone.org/install.sh | bash
fi

# Crée /var/log pour les logs
touch /var/log/keymatch-backup.log /var/log/keymatch-backup-test.log
chown ubuntu:ubuntu /var/log/keymatch-backup*.log
chmod 644 /var/log/keymatch-backup*.log

# Copie units systemd
echo "→ Installe systemd units"
cp "${ROOT_DIR}/systemd/keymatch-backup.service" /etc/systemd/system/
cp "${ROOT_DIR}/systemd/keymatch-backup.timer" /etc/systemd/system/
cp "${ROOT_DIR}/systemd/keymatch-backup-test.service" /etc/systemd/system/
cp "${ROOT_DIR}/systemd/keymatch-backup-test.timer" /etc/systemd/system/

systemctl daemon-reload

echo "→ Active les timers"
systemctl enable --now keymatch-backup.timer
systemctl enable --now keymatch-backup-test.timer

echo ""
echo "✓ Setup backup terminé"
echo ""
echo "Pour activer le upload offsite, configure rclone :"
echo "  Option A — Backblaze B2 (gratuit jusqu'à 10 GB) :"
echo "    sudo -u ubuntu rclone config"
echo "    → New remote → b2 → Account ID + Application Key"
echo "    → Note le nom du remote (ex: 'b2-keymatch'), ajoute dans .env :"
echo "      RCLONE_REMOTE=b2-keymatch:keymatch-backups"
echo ""
echo "  Option B — OVH Object Storage (compte OVH déjà actif, 0,01€/Go) :"
echo "    Active Object Storage dans le manager OVH → Storage → Object Storage"
echo "    Crée un container (équivalent bucket S3)"
echo "    sudo -u ubuntu rclone config"
echo "    → New remote → swift (OpenStack) → renseigne credentials OVH"
echo "    → RCLONE_REMOTE=ovh-keymatch:keymatch-backups"
echo ""
echo "Test manuel :"
echo "  sudo systemctl start keymatch-backup.service"
echo "  tail -f /var/log/keymatch-backup.log"
echo ""
echo "Status timers :"
echo "  systemctl list-timers keymatch-*"
