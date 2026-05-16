#!/usr/bin/env bash
#
# bootstrap-vps.sh — Setup automatique du VPS OVH Ubuntu 24.04 pour worker
# Zendriver KeyMatch (Phase 1 du plan migration OVH).
#
# Usage (depuis le VPS, après SSH initial) :
#   curl -fsSL https://raw.githubusercontent.com/deadoos266/NextImmo-main/main/tools/zendriver-worker/bootstrap-vps.sh | bash
#
# Ce que ça fait :
#   1. Met à jour le système (apt full-upgrade)
#   2. Installe UFW + fail2ban + unattended-upgrades (sécurité)
#   3. Configure firewall (allow 22/80/443)
#   4. Installe Docker + Docker Compose
#   5. Installe Caddy (reverse proxy TLS)
#   6. Clone le repo NextImmo dans /opt/keymatch
#   7. Configure le worker (.env avec FETCHER_TOKEN aléatoire)
#   8. Build et démarre le worker via Docker Compose
#   9. Configure Caddy pour fetcher.keymatch-immo.fr → localhost:8080
#  10. Affiche un récap avec le token + URLs à mettre dans Vercel
#
# Idempotent : peut se relancer plusieurs fois sans casser.
# Durée estimée : 10-15 minutes.

set -euo pipefail

# ─── Helpers d'affichage ───────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

step() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

# ─── Configuration (modifiable) ────────────────────────────────────────────
REPO_URL="https://github.com/deadoos266/NextImmo-main.git"
INSTALL_DIR="/opt/keymatch"
CADDY_DOMAIN="${CADDY_DOMAIN:-fetcher.keymatch-immo.fr}"
NEED_RELOGIN=0

# ─── Vérifications préalables ──────────────────────────────────────────────
step "Vérifications préalables"

if [[ "$(id -u)" -eq 0 ]]; then
  warn "Le script ne doit PAS être lancé en root direct. Re-lance en user ubuntu avec sudo."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  warn "sudo manquant ?!"; exit 1
fi

if ! grep -q "Ubuntu 24" /etc/os-release; then
  warn "Ce script est testé pour Ubuntu 24.04 LTS uniquement. Tu es sur :"
  cat /etc/os-release | grep PRETTY_NAME
  read -rp "Continuer quand même ? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || exit 1
fi

ok "Distribution OK : $(grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '"')"
ok "User : $(whoami)"
ok "Hostname : $(hostname)"

# ─── 1. Update système ─────────────────────────────────────────────────────
step "1/10 — Mise à jour du système (peut prendre 2-5 min)"

sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get full-upgrade -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
ok "Système à jour"

# ─── 2. Outils de base ─────────────────────────────────────────────────────
step "2/10 — Installation outils de base"

sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  ca-certificates curl gnupg git ufw fail2ban unattended-upgrades \
  htop tmux jq python3 python3-pip openssl
ok "Outils installés (git, ufw, fail2ban, htop, jq, etc.)"

# ─── 3. Firewall UFW ───────────────────────────────────────────────────────
step "3/10 — Configuration firewall UFW"

sudo ufw --force reset >/dev/null
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP (Caddy redirect)'
sudo ufw allow 443/tcp comment 'HTTPS (Caddy)'
sudo ufw --force enable
ok "UFW : SSH + 80 + 443 ouverts, reste fermé"
sudo ufw status verbose | head -15

# ─── 4. fail2ban + unattended-upgrades ─────────────────────────────────────
step "4/10 — fail2ban + auto-updates sécurité"

sudo systemctl enable --now fail2ban
sudo systemctl enable --now unattended-upgrades
ok "fail2ban actif (jail SSH par défaut)"
ok "Auto-updates sécurité activés"

# ─── 5. Docker + Compose ───────────────────────────────────────────────────
step "5/10 — Installation Docker + Compose (peut prendre 3 min)"

if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Ajoute user au groupe docker pour run sans sudo
if ! groups "$(whoami)" | grep -q docker; then
  sudo usermod -aG docker "$(whoami)"
  NEED_RELOGIN=1
  warn "Tu as été ajouté au groupe docker. Il faudra déconnecter/reconnecter SSH pour que ce soit pris en compte (le script utilise sudo pour cette session)."
fi

sudo systemctl enable --now docker
sudo docker --version
sudo docker compose version
ok "Docker + Compose installés"

# ─── 6. Caddy ──────────────────────────────────────────────────────────────
step "6/10 — Installation Caddy (reverse-proxy TLS auto)"

if ! command -v caddy >/dev/null 2>&1; then
  sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -fsSL "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy
fi
caddy version
ok "Caddy installé"

# ─── 7. Clone repo + worker setup ──────────────────────────────────────────
step "7/10 — Clone repo KeyMatch + configuration worker"

sudo mkdir -p "$INSTALL_DIR"
sudo chown "$(whoami):$(whoami)" "$INSTALL_DIR"

if [[ -d "$INSTALL_DIR/NextImmo-main" ]]; then
  ok "Repo déjà cloné, pull latest"
  cd "$INSTALL_DIR/NextImmo-main"
  git pull --ff-only
else
  cd "$INSTALL_DIR"
  git clone --depth 1 "$REPO_URL"
fi
cd "$INSTALL_DIR/NextImmo-main/tools/zendriver-worker"

# Génère un token Bearer aléatoire 64 hex chars (si .env n'existe pas déjà)
if [[ ! -f .env ]]; then
  FETCHER_TOKEN=$(openssl rand -hex 32)
  cp .env.example .env
  # Remplace la ligne FETCHER_TOKEN= dans .env
  sudo sed -i "s|^FETCHER_TOKEN=.*|FETCHER_TOKEN=${FETCHER_TOKEN}|" .env
  ok "Worker .env créé avec FETCHER_TOKEN aléatoire"
else
  FETCHER_TOKEN=$(grep '^FETCHER_TOKEN=' .env | cut -d= -f2)
  ok "Worker .env déjà présent, token conservé"
fi

# ─── 8. Build + start worker via Docker Compose ────────────────────────────
step "8/10 — Build et démarrage du worker (peut prendre 5-8 min, télécharge Chromium)"

sudo docker compose up -d --build
sleep 5

# Wait for healthcheck
HEALTHY=0
for i in {1..30}; do
  if sudo docker compose ps | grep -q "healthy\|running"; then
    HEALTHY=1
    break
  fi
  echo -n "."
  sleep 2
done
echo ""

if [[ "$HEALTHY" -eq 1 ]]; then
  ok "Worker démarré"
else
  warn "Worker pas encore healthy après 60s. Logs :"
  sudo docker compose logs --tail=20
fi

# ─── 9. Caddy config + reload ──────────────────────────────────────────────
step "9/10 — Configuration Caddy pour ${CADDY_DOMAIN}"

CADDY_CONFIG=$(cat <<EOF
${CADDY_DOMAIN} {
    reverse_proxy localhost:8080
    encode gzip zstd
    log {
        output file /var/log/caddy/fetcher.log {
            roll_size 50mb
            roll_keep 5
        }
        format json
    }
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
EOF
)

sudo mkdir -p /var/log/caddy
echo "$CADDY_CONFIG" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl enable caddy
sudo systemctl reload caddy 2>/dev/null || sudo systemctl restart caddy
ok "Caddy configuré pour ${CADDY_DOMAIN}"

# ─── 10. Tests santé + récap ───────────────────────────────────────────────
step "10/10 — Tests santé"

echo "Local health (sans TLS) :"
curl -s -H "Authorization: Bearer ${FETCHER_TOKEN}" http://localhost:8080/health | jq . || echo "(jq error, raw response above)"

echo ""
echo "Status Docker Compose :"
sudo docker compose ps

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓✓✓ BOOTSTRAP TERMINÉ ✓✓✓${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Récap pour configurer Vercel + DNS :"
echo ""
echo "1. DANS OVH ZONE DNS (manager → Domaines → keymatch-immo.fr → Zone DNS) :"
echo "   Ajoute un A record :"
echo "     Sous-domaine    : fetcher"
echo "     Cible           : $(curl -s -4 ifconfig.me 2>/dev/null || echo "<IP_VPS>")"
echo "     TTL             : 60 (pour propagation rapide la 1ère fois, repassera à 3600 après)"
echo ""
echo "2. DANS VERCEL DASHBOARD (keymatch → Settings → Environment Variables),"
echo "   ajoute (Production + Preview) :"
echo ""
echo "   EXTERNAL_FETCHER_URL = https://${CADDY_DOMAIN}"
echo "   EXTERNAL_FETCHER_TOKEN = ${FETCHER_TOKEN}"
echo "   EXTERNAL_FETCHER_TIMEOUT_MS = 25000"
echo "   EXTERNAL_FETCHER_ENABLED_HOSTS = leboncoin.fr,seloger.com,logic-immo.com"
echo ""
echo "3. Trigger un redeploy Vercel pour appliquer les env vars."
echo ""
echo "4. Test live (après propagation DNS ~5 min) :"
echo "   curl -H \"Authorization: Bearer ${FETCHER_TOKEN}\" https://${CADDY_DOMAIN}/health"
echo ""
if [[ "$NEED_RELOGIN" -eq 1 ]]; then
  warn "Pour profiter du groupe docker sans sudo : déconnecte-toi (exit) puis reconnecte-toi en SSH."
fi
echo ""
echo "Logs worker : sudo docker compose logs -f (dans $INSTALL_DIR/NextImmo-main/tools/zendriver-worker)"
echo "Restart worker : sudo docker compose restart"
echo "Update worker : cd $INSTALL_DIR/NextImmo-main && git pull && cd tools/zendriver-worker && sudo docker compose up -d --build"
echo ""
