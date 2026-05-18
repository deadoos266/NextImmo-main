# KeyMatch Camoufox Worker — Phase P3-7

Worker bypass DataDome basé sur **Camoufox** (fork Firefox stealth) déployé
sur **Oracle Cloud Always Free** (ARM Ampere 24 GB RAM, gratuit à vie).

## Pourquoi Camoufox + Oracle Cloud

- Le worker **Zendriver** (Chromium) déjà en place sur OVH a un **taux de
  bypass DataDome de ~0%** car DataDome bloque les ASN OVH au niveau IP.
- Camoufox = Firefox + patches stealth (humanize, geoip, anti-fingerprint
  firmware-level). DataDome a moins affiné ses détections sur Firefox.
- Oracle Cloud Always Free = ASN différent (Oracle Cloud Infrastructure),
  non bloqué par défaut.
- Coût : **0€/mois à vie** sur l'offre Always Free Ampere (24 GB RAM, 4 OCPU).

## Architecture

```
USER → Vercel/VPS Next.js
        │ POST /api/proprio/annonce/import
        │ {url:"https://www.leboncoin.fr/ad/locations/..."}
        ▼
   route.ts détecte host DataDome
        │ crée import_jobs row, status='pending'
        │ fire-and-forget HTTPS → worker Camoufox
        │ retourne 202 {job_id}
        ▼
   Oracle Cloud VM (24 GB Ampere)
        │ keymatch-camoufox container
        │ pool 3 Firefox stealth warm
        │ résout challenge DataDome (3-10s)
        │ POST callback HTTPS vers /api/proprio/annonce/import/callback
        ▼
   Next.js parse HTML via parsers existants
        │ UPDATE import_jobs status='done' + data jsonb
        ▼
   Client poll /api/proprio/annonce/import/status?id=<job_id> toutes les 2s
        ▼
   UI affiche champs pré-remplis dans le wizard
```

## ⚠ Voie de déploiement recommandée

**N'utilise PAS le Dockerfile depuis ton PC.** Le `RUN camoufox fetch` télécharge
un binaire Firefox spécifique à l'arch du HOST de build. Build sur Windows/Intel
puis push vers ARM Ampere = Firefox refuse de démarrer.

**Voie recommandée** : **venv Python + systemd directement sur la VM Oracle**
(suivre Phase A → B → C). Le Dockerfile reste utile uniquement pour smoke
test la logique FastAPI/SSRF en local sur ton PC.

## Setup pas-à-pas

### Phase A — Oracle Cloud (45 min, à faire par Paul)

1. Crée compte sur https://signup.cloud.oracle.com (région **Frankfurt**, CB
   requise pour vérif, **pas débitée** sur Always Free).
2. Console → Compute → Create instance :
   - Nom : `keymatch-fetcher`
   - Image : Ubuntu 22.04
   - Shape : **VM.Standard.A1.Flex 4 OCPU/24 GB** (ARM Ampere)
   - Public IPv4 : oui (besoin pour SSH initial puis cloudflared tunnel)
   - 50 GB boot volume
   - SSH key Ed25519 générée localement (`ssh-keygen -t ed25519 -f ~/.ssh/oracle-keymatch`)
3. Si "Out of capacity" : retry toutes les 30 min ou bascule région (Phoenix,
   Ashburn). C'est connu sur Always Free Frankfurt.

### Phase B — Worker (~1h30)

```bash
ssh -i ~/.ssh/oracle-keymatch ubuntu@<oracle-public-ip>

# Deps système
sudo apt update && sudo apt install -y python3.11 python3.11-venv \
    libgtk-3-0 libdbus-glib-1-2 libxt6 libasound2 libpci3 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxss1 libnss3 \
    libxshmfence1 fonts-noto-color-emoji fonts-liberation

# User dédié
sudo useradd -m -s /bin/bash keymatch
sudo -u keymatch -i

# Python venv
python3.11 -m venv ~/venv
source ~/venv/bin/activate
mkdir ~/worker && cd ~/worker

# Copy les fichiers worker.py, pool.py, ssrf.py, requirements.txt, .env
# (par scp depuis ton poste ou via git clone du repo NextImmo)
git clone https://github.com/deadoos266/NextImmo-main.git /tmp/keymatch-repo
cp /tmp/keymatch-repo/tools/camoufox-worker/{worker.py,pool.py,ssrf.py,requirements.txt} .
cp /tmp/keymatch-repo/tools/camoufox-worker/.env.example .env
rm -rf /tmp/keymatch-repo

# Installe deps
pip install -r requirements.txt

# Télécharge le binaire Firefox stealth (~250 MB ARM64)
camoufox fetch

# Génère token + édite .env
nano .env  # Set FETCHER_TOKEN, CALLBACK_TOKEN, etc.

# Test smoke
python worker.py &
curl -H "Authorization: Bearer $FETCHER_TOKEN" http://127.0.0.1:8080/health
# Attendu : {"ok": true, "pool": {"size": 3, ...}, ...}
kill %1
```

### Phase C — systemd (5 min)

```bash
sudo cp ~/worker/keymatch-camoufox.service /etc/systemd/system/
# OU
sudo cp /tmp/keymatch-repo/tools/camoufox-worker/systemd/keymatch-camoufox.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now keymatch-camoufox.service
journalctl -u keymatch-camoufox -f
# Attends "pool ready"
```

### Phase D — Cloudflared tunnel (~30 min)

```bash
# Install cloudflared ARM64
curl -L -o cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared.deb

# Auth (ouvre une URL dans le browser local)
cloudflared tunnel login

# Crée le tunnel
cloudflared tunnel create keymatch-fetcher
# Note l'UUID retourné

# Config (copy cloudflared/config.yml.example et adapte)
sudo mkdir -p /etc/cloudflared
sudo cp ~/worker/cloudflared/config.yml.example /etc/cloudflared/config.yml
sudo nano /etc/cloudflared/config.yml  # remplace <TUNNEL-UUID> + <ACCOUNT>

# Route DNS automatique (Cloudflare crée le CNAME pour toi sur *.workers.dev)
cloudflared tunnel route dns keymatch-fetcher keymatch-fetcher.<account>.workers.dev

# Service systemd
sudo cloudflared service install

# Test depuis ton poste
curl -H "Authorization: Bearer $FETCHER_TOKEN" https://keymatch-fetcher.<account>.workers.dev/health
```

### Phase E — Vercel/VPS env vars (5 min)

Sur VPS KeyMatch (`/etc/keymatch-prod.env`) :

```bash
EXTERNAL_FETCHER_CAMOUFOX_URL=https://keymatch-fetcher.<account>.workers.dev
EXTERNAL_FETCHER_CAMOUFOX_TOKEN=<même FETCHER_TOKEN qu'Oracle>
EXTERNAL_FETCHER_TIMEOUT_MS=25000
EXTERNAL_FETCHER_ENABLED_HOSTS=leboncoin.fr,seloger.com,logic-immo.com
WORKER_CALLBACK_TOKEN=<même CALLBACK_TOKEN qu'Oracle>
```

Restart container Next.js :

```bash
sudo docker compose -f /opt/keymatch/NextImmo-main/tools/next-vps/docker-compose.yml \
    up -d --build keymatch-next
```

## Tests

### Tests unitaires (sans Camoufox)

```bash
cd /home/keymatch/worker
pip install pytest
pytest test_worker.py -v
```

### Test E2E (Camoufox actif)

```bash
# Sur la VM Oracle
curl -X POST \
    -H "Authorization: Bearer $FETCHER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://www.leboncoin.fr/ad/locations/2806183617"}' \
    http://127.0.0.1:8080/fetch | jq -r '.html' | head -50
```

Attendu : HTML > 50 KB, contient l'adresse + le prix + la description.

## Monitoring

Côté admin KeyMatch :
- `/admin/imports` : success rate par parser (objectif > 30% sur LBC/SeLoger/Logic-immo)
- `/admin/operations` : ping `/health` du worker Camoufox (latency + pool stats)

Si success rate < 30% pendant 24h → check :
1. Camoufox version (peut-être upgrade dispo)
2. DataDome a-t-il bloqué l'ASN Oracle ? (rare mais possible)
3. Quota Oracle Cloud Always Free dépassé ?

## Mise à jour Camoufox (tous les 1-3 mois)

```bash
ssh ubuntu@<oracle-public-ip>
sudo systemctl stop keymatch-camoufox
sudo -u keymatch -i
source ~/venv/bin/activate
pip install --upgrade camoufox
camoufox fetch    # re-télécharge le binaire Firefox patché
sudo systemctl start keymatch-camoufox
journalctl -u keymatch-camoufox -f
```

## Rollback

Si Camoufox plante après update :
```bash
sudo systemctl stop keymatch-camoufox
pip install camoufox==0.4.11   # version précédente
camoufox fetch
sudo systemctl start keymatch-camoufox
```

Côté KeyMatch, désactive le routing Camoufox :
```bash
# /etc/keymatch-prod.env
EXTERNAL_FETCHER_ENABLED_HOSTS=   # vide → fallback Zendriver OVH (toujours dispo)
```

## Coût

- **Oracle Cloud Always Free** : 0€/mois à vie (24 GB RAM, 4 OCPU, 50 GB stockage)
- **Cloudflare** (tunnel) : 0€/mois
- **Total** : 0€/mois

Si Always Free saturé en région Frankfurt, fallback **VM.Standard.E2.1.Micro**
(x86_64, 1 GB RAM, gratuit aussi mais POOL_SIZE=1 obligatoire).

## Référence

Plan complet : `nestmatch/docs/MIGRATION_OVH_COMPLETE_PLAN.md` (Phase reportée P3-7).
Worker Zendriver original : `tools/zendriver-worker/` (sur OVH, 0% bypass mais
conservé comme fallback gratuit).
