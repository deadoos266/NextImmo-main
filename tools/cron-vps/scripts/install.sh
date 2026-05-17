#!/usr/bin/env bash
# Installe les 22 systemd units (service + timer) sur le VPS — Phase 9.
#
# Pré-requis :
#   - /etc/keymatch.env existe avec CRON_SECRET + KEYMATCH_BASE_URL
#   - tools/cron-vps/scripts/generate-systemd-units.sh a tourné (génère les units)
#
# Usage : sudo ./scripts/install.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UNITS_DIR="${ROOT_DIR}/systemd"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "❌ Lance avec sudo (besoin pour écrire /etc/systemd/system/)" >&2
  exit 1
fi

if [[ ! -f /etc/keymatch.env ]]; then
  echo "❌ /etc/keymatch.env manquant. Crée-le avec CRON_SECRET + KEYMATCH_BASE_URL." >&2
  exit 1
fi

if ! grep -q "CRON_SECRET=" /etc/keymatch.env; then
  echo "❌ CRON_SECRET absent de /etc/keymatch.env" >&2
  exit 1
fi

UNITS=$(find "$UNITS_DIR" -name "keymatch-cron-*.service" -o -name "keymatch-cron-*.timer" | wc -l)
if [[ "$UNITS" -eq 0 ]]; then
  echo "❌ Aucune unit dans $UNITS_DIR. Lance d'abord :" >&2
  echo "   ./scripts/generate-systemd-units.sh" >&2
  exit 1
fi
echo "→ ${UNITS} units à installer"

# Touch log
touch /var/log/keymatch-cron.log
chown ubuntu:ubuntu /var/log/keymatch-cron.log
chmod 644 /var/log/keymatch-cron.log

# Logrotate
cat > /etc/logrotate.d/keymatch-cron <<'EOF'
/var/log/keymatch-cron.log {
  daily
  rotate 30
  compress
  missingok
  notifempty
  copytruncate
  su ubuntu ubuntu
}
EOF

# Install units
echo "→ Copie units vers /etc/systemd/system/"
cp "${UNITS_DIR}"/keymatch-cron-*.{service,timer} /etc/systemd/system/

systemctl daemon-reload

# Enable + start tous les timers
echo "→ Enable + start timers"
COUNT=0
for timer in /etc/systemd/system/keymatch-cron-*.timer; do
  name=$(basename "$timer")
  systemctl enable --now "$name"
  COUNT=$((COUNT + 1))
done

echo ""
echo "✓ Installé ${COUNT} timers KeyMatch"
echo ""
echo "Vérifier l'état :"
echo "  systemctl list-timers keymatch-cron-*"
echo ""
echo "Voir les logs :"
echo "  tail -f /var/log/keymatch-cron.log"
echo ""
echo "Tester un cron manuellement :"
echo "  sudo systemctl start keymatch-cron-health-check.service"
echo ""
echo "Désactiver les crons Vercel après validation 7 jours :"
echo "  Retirer le bloc \"crons\" de nestmatch/vercel.json + commit/push"
