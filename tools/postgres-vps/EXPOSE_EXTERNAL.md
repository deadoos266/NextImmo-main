# Exposer Postgres VPS à Vercel (cutover Phase 2)

3 options pour permettre à Vercel (Next.js serverless) d'attaquer le Postgres VPS pendant la phase transition AVANT Phase 6 (cutover Next.js sur VPS).

## Contexte

Aujourd'hui le Postgres VPS écoute sur `127.0.0.1:5432` (bind localhost only, pas exposé en externe). Pour que Vercel s'y connecte via `DATABASE_URL`, il faut une route entre internet et le VPS sur le port DB.

## Option A — Cloudflare Tunnel TCP (recommandée, gratuit, masque l'IP VPS)

**Coût** : 0€, **Sécurité** : ★★★★★ (zero trust, pas d'IP publique exposée)

### Setup
```bash
# 1. Compte Cloudflare gratuit (si pas déjà)
# 2. Sur le VPS :
ssh -i $HOME/.ssh/keymatch_vps ubuntu@149.202.60.152
sudo curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
  -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb

# 3. Auth Cloudflare (ouvre une URL dans le navigateur)
cloudflared tunnel login

# 4. Crée le tunnel
cloudflared tunnel create keymatch-postgres
# Noter l'UUID retourné, ex: 12345abc-...

# 5. Config /etc/cloudflared/config.yml :
sudo tee /etc/cloudflared/config.yml > /dev/null <<EOF
tunnel: <UUID>
credentials-file: /root/.cloudflared/<UUID>.json
ingress:
  - hostname: pg.keymatch-immo.fr
    service: tcp://localhost:6432   # PgBouncer (recommandé) ou 5432 (direct)
  - service: http_status:404
EOF

# 6. Route DNS via Cloudflare API (CNAME auto)
cloudflared tunnel route dns keymatch-postgres pg.keymatch-immo.fr

# 7. Systemd service auto-restart
sudo cloudflared service install
sudo systemctl enable --now cloudflared

# 8. Test depuis ta machine locale
cloudflared access tcp --hostname pg.keymatch-immo.fr --url localhost:15432
# Dans un autre terminal :
psql "postgresql://keymatch:PASS@localhost:15432/keymatch"
```

### Côté Vercel
```
DATABASE_URL=postgresql://keymatch:PASS@pg.keymatch-immo.fr:6432/keymatch?sslmode=require
```

⚠ **Vercel ne peut PAS** se connecter à un Cloudflare Tunnel TCP directement (il faut le client `cloudflared access`). Pour Vercel, utilise **Cloudflare Tunnel HTTP avec un proxy Postgres** (option B ci-dessous) OU expose en IP publique (option C).

## Option B — Caddy avec PgBouncer + auth scram-sha-256 (recommandé pour Vercel)

**Coût** : 0€, **Sécurité** : ★★★★ (TLS + auth scram-sha-256, mais IP VPS exposée)

### Setup
```bash
# 1. DNS OVH : A record `pg.keymatch-immo.fr` → IP VPS
# 2. UFW : autoriser port 6432 sur IPs Vercel uniquement (range AWS us-east-1)
#    OU autoriser tout (le mot de passe SCRAM est solide)
sudo ufw allow 6432/tcp comment "Vercel → Postgres VPS via PgBouncer"

# 3. PgBouncer déjà configuré dans docker-compose.yml (port 6432 bind 127.0.0.1)
#    → modifier le bind pour exposer en externe :
sudo nano tools/postgres-vps/docker-compose.yml
# Change `"127.0.0.1:6432:5432"` en `"6432:5432"` (bind 0.0.0.0)
# OU mieux : ajoute un service Caddy stream pour TLS termination

# 4. Force scram-sha-256 dans pg_hba.conf (déjà par défaut en Postgres 17)
sudo docker exec keymatch-postgres psql -U keymatch -c "
  SHOW password_encryption
"
# Doit retourner "scram-sha-256"

# 5. Vercel env :
DATABASE_URL=postgresql://keymatch:PASS@pg.keymatch-immo.fr:6432/keymatch?sslmode=require
```

⚠ **Attention sécurité** : 6432 exposé publiquement → bruteforce password possible. Mitiger :
- Mot de passe DB ≥32 chars random
- fail2ban Postgres (à setup)
- Rotation password mensuelle

## Option C — Reverse SSH tunnel temporaire (test only, pas prod)

**Coût** : 0€, **Sécurité** : ★★★ (manuel, pas redémarre auto)

```bash
# Sur ta machine de dev (pour test ponctuel) :
ssh -i $HOME/.ssh/keymatch_vps -L 5432:localhost:5432 -N ubuntu@149.202.60.152

# Dans un autre terminal :
psql "postgresql://keymatch:PASS@localhost:5432/keymatch"
```

Pas une vraie solution prod. Sert juste à tester avant cutover.

## Recommandation pour KeyMatch

**Phase de test (Phase 2 → Phase 6)** : Option **A** (Cloudflare Tunnel) pour valider que Next.js Vercel marche avec Postgres VPS.

**Phase prod (Phase 6 cutover Next.js sur VPS)** : plus besoin d'exposer Postgres. Next.js VPS parle à Postgres via le réseau Docker interne (`keymatch-postgres:5432`).

Donc Option A est utile **30 jours max**, puis on désactive.
