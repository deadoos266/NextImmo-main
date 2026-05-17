#!/usr/bin/env bash
# Génère les fichiers systemd .service + .timer pour les 22 crons KeyMatch
# à partir de tools/cron-vps/cron-routes.tsv.
#
# Usage :
#   ./scripts/generate-systemd-units.sh
#
# Produit :
#   tools/cron-vps/systemd/keymatch-cron-<name>.service
#   tools/cron-vps/systemd/keymatch-cron-<name>.timer
#
# Re-run safe (overwrite des fichiers existants).
#
# Installation sur VPS après génération :
#   sudo ./scripts/install.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TSV="${ROOT_DIR}/cron-routes.tsv"
OUT_DIR="${ROOT_DIR}/systemd"

if [[ ! -f "$TSV" ]]; then
  echo "❌ $TSV introuvable" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Convertit un schedule cron classique (5 champs) en OnCalendar systemd.
# Couvre les patterns utilisés par KeyMatch ; cas complexes hors scope.
# Format cron : minute hour day-of-month month day-of-week
# Format systemd OnCalendar : DOW Y-M-D H:M:S
cron_to_oncalendar() {
  local cron="$1"
  local min hour dom month dow
  read -r min hour dom month dow <<< "$cron"

  # Day of week : 1..5 Mon..Fri, 0/7 Sun. Si vide ou *, ignore.
  local dow_str=""
  case "$dow" in
    "*") ;;
    "0"|"7") dow_str="Sun" ;;
    "1") dow_str="Mon" ;;
    "2") dow_str="Tue" ;;
    "3") dow_str="Wed" ;;
    "4") dow_str="Thu" ;;
    "5") dow_str="Fri" ;;
    "6") dow_str="Sat" ;;
  esac

  # Hour : peut être "*", un nombre, ou "10,18", ou "*/6"
  # Si plusieurs valeurs (10,18) ou range, systemd OnCalendar gère via list.

  # Construit la date / heure
  local date_part
  if [[ "$dom" == "*" ]]; then
    date_part="*-*-*"
  else
    # Zero-pad day of month si numérique simple
    if [[ "$dom" =~ ^[0-9]+$ ]]; then
      dom=$(printf "%02d" "$dom")
    fi
    date_part="*-*-${dom}"
  fi

  # systemd OnCalendar exige 2-digit padding sur heure et minute.
  # On laisse les patterns "*", "10,18" intacts (pas de padding sur les listes/wildcards).
  # V97.39.20 fix verifier — systemd OnCalendar accepte */N pour stride, MAIS
  # certaines versions plus anciennes (Ubuntu 20.04 et avant) parsent mal le
  # `*/N` quand combiné avec :00:00. On convertit systématiquement en `00/0N`
  # qui est universellement supporté (form canonique de la doc systemd.time).
  if [[ "$hour" =~ ^\*/([0-9]+)$ ]]; then
    hour="00/$(printf "%02d" "${BASH_REMATCH[1]}")"
  elif [[ "$hour" =~ ^[0-9]+$ ]]; then
    hour=$(printf "%02d" "$hour")
  fi
  if [[ "$min" =~ ^\*/([0-9]+)$ ]]; then
    min="00/$(printf "%02d" "${BASH_REMATCH[1]}")"
  elif [[ "$min" =~ ^[0-9]+$ ]]; then
    min=$(printf "%02d" "$min")
  fi

  local time_part="${hour}:${min}:00"

  if [[ -n "$dow_str" ]]; then
    echo "${dow_str} ${date_part} ${time_part}"
  else
    echo "${date_part} ${time_part}"
  fi
}

# Truncate le compteur
GEN_COUNT=0

while IFS=$'\t' read -r name path schedule desc; do
  # Skip commentaires et lignes vides
  case "$name" in
    \#*|"") continue ;;
  esac

  # Génère .service
  cat > "${OUT_DIR}/keymatch-cron-${name}.service" <<EOF
[Unit]
Description=KeyMatch cron ${name} — ${desc}
After=docker.service network-online.target

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=/opt/keymatch/NextImmo-main
ExecStart=/bin/bash /opt/keymatch/NextImmo-main/tools/cron-vps/scripts/run-cron.sh ${name} ${path}
StandardOutput=append:/var/log/keymatch-cron.log
StandardError=append:/var/log/keymatch-cron.log
# Si fail, ne pas spammer (cron-routes.tsv est source de vérité)
Restart=no
TimeoutStartSec=320s

[Install]
WantedBy=multi-user.target
EOF

  # Génère .timer
  OnCalendar=$(cron_to_oncalendar "$schedule")
  cat > "${OUT_DIR}/keymatch-cron-${name}.timer" <<EOF
[Unit]
Description=KeyMatch cron timer ${name} — schedule "${schedule}"

[Timer]
OnCalendar=${OnCalendar}
Persistent=true
RandomizedDelaySec=2min
AccuracySec=1min

[Install]
WantedBy=timers.target
EOF

  GEN_COUNT=$((GEN_COUNT + 1))
  echo "  ✓ keymatch-cron-${name}: ${schedule} → ${OnCalendar}"

done < "$TSV"

echo ""
echo "✓ Généré ${GEN_COUNT} units (service + timer) dans ${OUT_DIR}"
echo ""
echo "Prochaine étape : sudo ./scripts/install.sh"
