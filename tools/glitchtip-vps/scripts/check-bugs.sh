#!/usr/bin/env bash
# Check GlitchTip pour les bugs récents — V97.39.34 KeyMatch
#
# Usage (depuis VPS) :
#   sudo bash /opt/keymatch/NextImmo-main/tools/glitchtip-vps/scripts/check-bugs.sh [period]
#
# period : "24h" (défaut), "7d", "30d"
#
# Sortie : résumé compact des erreurs récentes (titre, count, last seen, URL).
#
# Lu par Claude via SSH quand l'utilisateur dit "check les bugs".

set -euo pipefail

PERIOD="${1:-24h}"
TOKEN=$(sudo grep ^GLITCHTIP_API_TOKEN= /etc/keymatch-prod.env | cut -d= -f2)
BASE="https://sentry.keymatch-immo.fr/api/0"
ORG="keymatch"

if [ -z "$TOKEN" ]; then
  echo "❌ GLITCHTIP_API_TOKEN absent de /etc/keymatch-prod.env"
  exit 1
fi

echo "🔍 Bugs GlitchTip sur $PERIOD (org=$ORG)"
echo ""

# Fetch issues (alertes non résolues groupées)
RESPONSE=$(curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE/organizations/$ORG/issues/?statsPeriod=$PERIOD&limit=50&query=is:unresolved")

# Count
COUNT=$(echo "$RESPONSE" | jq 'length')

if [ "$COUNT" = "0" ]; then
  echo "✅ Aucune erreur sur $PERIOD."
  echo ""
  echo "Total events sur la période :"
  curl -sS -H "Authorization: Bearer $TOKEN" \
    "$BASE/organizations/$ORG/stats/?stat=received&since=$(date -d "-$PERIOD" +%s)" \
    2>/dev/null | jq -r '. | length // 0' || echo "(stats endpoint non dispo)"
  exit 0
fi

echo "⚠️  $COUNT issue(s) non résolue(s) :"
echo ""

# Affiche les top issues
echo "$RESPONSE" | jq -r '.[] | "
─────────────────────────────────────
🐛 \(.title // .culprit // "Unknown")
   Niveau    : \(.level // "?")
   Count     : \(.count) occurrence(s)
   Users     : \(.userCount) utilisateur(s)
   Last seen : \(.lastSeen)
   Status    : \(.status)
   URL       : \(.permalink // "n/a")
"'

echo ""
echo "─────────────────────────────────────"
echo "Vue complète : https://sentry.keymatch-immo.fr/keymatch/keymatch-next/"
