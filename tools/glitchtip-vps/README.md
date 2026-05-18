# GlitchTip self-host — KeyMatch

Remplace Sentry SaaS par GlitchTip (fork open-source léger, compat Sentry
SDK donc 0 changement code côté KeyMatch).

## Pourquoi GlitchTip et pas Sentry self-host ?

- **Sentry self-host** : stack lourde (Postgres + Redis + Kafka + ZooKeeper
  + ClickHouse + Snuba + Symbolicator + Relay + 5 workers). 8-16 GB RAM
  minimum. Pas viable sur le VPS-2 8 GB qui tourne déjà Postgres + MinIO
  + Realtime + Next.js + Caddy + Camoufox.
- **GlitchTip** : fork ultra-léger. Stack = Django web + celery worker +
  Postgres (réutilise keymatch-postgres) + Redis. **~700 MB RAM total**.
- Compatible **Sentry SDK** côté code : aucun changement client. On flip
  juste `NEXT_PUBLIC_SENTRY_DSN` vers le DSN GlitchTip.

## Pré-requis

- Caddy installé (host systemd)
- `keymatch-postgres` (Phase 2) UP
- DNS `sentry.keymatch-immo.fr` → IP VPS dans OVH zone

## Setup (~45 min)

### 1. DNS (action Paul, ~30 sec)

OVH zone → Ajouter une entrée :
- Type : **A**
- Sous-domaine : `sentry`
- Cible : `149.202.60.152`
- TTL : 3600

### 2. Init DB Postgres

```bash
ssh ubuntu@149.202.60.152
cd /opt/keymatch/NextImmo-main && sudo git pull
cd tools/glitchtip-vps
sudo cp .env.example .env

# Génère les secrets
GT_PWD=$(openssl rand -hex 32)
GT_SK=$(openssl rand -base64 64 | tr -d '\n')
BREVO_KEY=$(sudo grep ^BREVO_API_KEY= /etc/keymatch-prod.env | cut -d= -f2)
sudo tee .env > /dev/null <<EOF
GLITCHTIP_DB_PASSWORD=$GT_PWD
GLITCHTIP_SECRET_KEY=$GT_SK
BREVO_API_KEY=$BREVO_KEY
EOF

# Crée DB + rôle
sudo bash scripts/init-db.sh
```

### 3. Démarre GlitchTip

```bash
sudo mkdir -p /srv/keymatch/glitchtip-redis
sudo chown -R 999:999 /srv/keymatch/glitchtip-redis
sudo docker compose up -d
sudo docker compose logs -f web
# Attends "Starting development server" ou logs gunicorn
```

### 4. Migrations Django + superuser

```bash
sudo docker compose exec web ./manage.py migrate
sudo docker compose exec web ./manage.py createsuperuser
# Email: tic3467@gmail.com
# Username: paul
# Password: <choose strong>
```

### 5. Caddy fragment

```bash
sudo cat tools/glitchtip-vps/Caddyfile.fragment | sudo tee -a /etc/caddy/Caddyfile
sudo touch /var/log/caddy/keymatch-sentry.log
sudo chown caddy:caddy /var/log/caddy/keymatch-sentry.log
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### 6. Open browser

https://sentry.keymatch-immo.fr → login avec ton superuser → Create org
"KeyMatch" → Create project "keymatch-next" (platform Next.js).

Notes le DSN affiché : `https://<KEY>@sentry.keymatch-immo.fr/<PROJECT_ID>`

### 7. Flip NEXT_PUBLIC_SENTRY_DSN

```bash
sudo sed -i "s|^NEXT_PUBLIC_SENTRY_DSN=.*|NEXT_PUBLIC_SENTRY_DSN=<DSN copy-pasté>|" /etc/keymatch-prod.env
cd /opt/keymatch/NextImmo-main/tools/next-vps
set -a; source /etc/keymatch-prod.env; set +a
sudo -E docker compose up -d --build keymatch-next
```

### 8. Vérifie

Trigger une erreur volontaire (ex: visit `/api/test-sentry`) → l'event
doit apparaître dans https://sentry.keymatch-immo.fr.

## Rollback

```bash
# Flip env var back vers Sentry SaaS DSN précédent
sudo sed -i "s|^NEXT_PUBLIC_SENTRY_DSN=.*|NEXT_PUBLIC_SENTRY_DSN=<ancien DSN Sentry>|" /etc/keymatch-prod.env
# Rebuild keymatch-next
```

## Quotas et limites

- **EVENTS_QUOTA_PER_HOUR = 1000** par défaut (Sentry SaaS Free = 5000/jour)
  → largement suffisant pour KeyMatch en pré-launch.
- **Storage** : la DB grandit avec les events. Cron de purge automatique
  (90 jours par défaut, configurable via `MAX_EVENT_LIFE_DAYS`).
- **CPU** : pic à 30% sur un Ampere 4 vCPU lors d'un burst. RAM stable ~700 MB.

## Monitoring

```bash
sudo docker stats keymatch-glitchtip-web keymatch-glitchtip-worker keymatch-glitchtip-redis
sudo docker logs keymatch-glitchtip-web --tail 30
```

## Update GlitchTip

```bash
sudo docker compose pull
sudo docker compose up -d
sudo docker compose exec web ./manage.py migrate
```

## Coût mensuel

| Service | Avant | Après |
|---|---|---|
| Sentry SaaS Free | 0€ | 0€ (will keep account dormant) |
| GlitchTip self-host | — | 0€ (~700 MB RAM sur VPS existant) |

Gain : indépendance + privacy (les error events restent sur le VPS, plus
chez un tiers SaaS). Pas d'économie financière (Sentry SaaS gratuit).
