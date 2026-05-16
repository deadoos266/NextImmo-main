# KeyMatch Fetcher — Worker Zendriver

Worker stealth pour bypass DataDome sur Leboncoin / SeLoger / Logic-immo.
Conforme au plan : [nestmatch/docs/MIGRATION_OVH_COMPLETE_PLAN.md](../../nestmatch/docs/MIGRATION_OVH_COMPLETE_PLAN.md) Phase 1.

## Architecture

```
Vercel /api/proprio/annonce/import (POST URL DataDome)
        ↓ fire-and-forget HTTPS Bearer auth
        ↓
Caddy reverse proxy (TLS Let's Encrypt)
        ↓
[VPS-2 OVH] localhost:8080 Docker keymatch-fetcher
        - FastAPI + Uvicorn
        - Pool 3 Zendriver Chromium warm
        - Bearer auth, SSRF guard, RL 60/h/IP, soft-challenge detect
        ↓ scrape
Leboncoin / SeLoger / Logic-immo
        ↓ HTML
        ↓ optionnel : callback POST → Vercel /api/proprio/annonce/import/callback
        ↓
Parse côté Next.js → import_jobs.status = 'done' → polling client voit le résultat
```

## Setup VPS pas-à-pas

### 1. SSH au VPS (déjà bootstrappé en Phase 0)

```bash
ssh keymatch@<IP_VPS>
```

### 2. Cloner le repo

```bash
cd /srv/keymatch
git clone https://github.com/deadoos266/NextImmo-main.git
cd NextImmo-main/tools/zendriver-worker
```

### 3. Configurer `.env`

```bash
cp .env.example .env
# Génère un token Bearer fort
python3 -c "import secrets; print('FETCHER_TOKEN=' + secrets.token_hex(32))" >> .env
nano .env  # ajuster ALLOW_HOSTS, RATE_LIMIT, etc.
```

**Important** : note la valeur `FETCHER_TOKEN`, tu vas la mettre aussi dans les env vars Vercel.

### 4. Build + run

```bash
docker compose up -d --build
# Suivre les logs
docker compose logs -f
```

Attendre ~30s que le pool soit prêt :
```
[INFO] worker.pool: Spawned slot 0 (user_data_dir=/tmp/zd-slot-0-xxx)
[INFO] worker.pool: Spawned slot 1 (...)
[INFO] worker.pool: Spawned slot 2 (...)
[INFO] worker.pool: Pool ready with 3 slots
[INFO] worker: Worker ready. Allow hosts: {'leboncoin.fr', 'seloger.com', 'logic-immo.com'}
```

### 5. Test santé local

```bash
TOKEN=$(grep FETCHER_TOKEN .env | cut -d= -f2)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/health | jq
```

Réponse attendue :
```json
{
  "ok": true,
  "uptime_s": 32,
  "pool": {"size": 3, "in_flight": 0, "total_fetches": 0, "fetches_per_slot": [0,0,0]},
  "allow_hosts": ["leboncoin.fr", "logic-immo.com", "seloger.com"],
  "rate_limit_per_hour": 60,
  "callback_configured": false
}
```

### 6. Test fetch live Leboncoin

```bash
curl -s -X POST http://localhost:8080/fetch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.leboncoin.fr/ad/locations/2900000000"}' \
  | jq '.ok, .status, (.html | length), .duration_ms'
```

Attendu (premier fetch cold start ~6-9s) :
```
true
200
85000
7200
```

Si DataDome challenge non résolu → `.ok: false, .code: "BOT_PROTECTION"`.

### 7. Caddy reverse proxy

Sur le VPS, ajoute à `/etc/caddy/Caddyfile` :

```caddyfile
fetcher.keymatch-immo.fr {
    reverse_proxy localhost:8080
    encode gzip zstd
    log {
        output file /var/log/caddy/fetcher.log
        format json
    }
}
```

Puis :
```bash
sudo systemctl reload caddy
```

Test externe :
```bash
curl -s -H "Authorization: Bearer $TOKEN" https://fetcher.keymatch-immo.fr/health
```

### 8. Sync les tokens dans Vercel

Dashboard Vercel → KeyMatch → Settings → Environment Variables → ajoute (Production + Preview) :

| Variable | Valeur |
|---|---|
| `EXTERNAL_FETCHER_URL` | `https://fetcher.keymatch-immo.fr` |
| `EXTERNAL_FETCHER_TOKEN` | (le hex token de l'étape 3) |
| `EXTERNAL_FETCHER_TIMEOUT_MS` | `25000` |
| `EXTERNAL_FETCHER_ENABLED_HOSTS` | `leboncoin.fr,seloger.com,logic-immo.com` |
| `WORKER_CALLBACK_TOKEN` | (autre hex token séparé) |

Sync aussi `CALLBACK_URL=https://keymatch-immo.fr/api/proprio/annonce/import/callback` et `CALLBACK_TOKEN=<WORKER_CALLBACK_TOKEN>` dans `/srv/keymatch/NextImmo-main/tools/zendriver-worker/.env`.

Redémarre :
```bash
docker compose restart
```

### 9. Trigger un déploiement Vercel pour appliquer les env vars

Sur ton poste de dev :
```bash
git commit --allow-empty -m "trigger redeploy with new env vars" && git push
```

## Maintenance

### Logs

```bash
docker compose logs --tail=200 -f
```

### Update Zendriver / Chromium

```bash
cd /srv/keymatch/NextImmo-main/tools/zendriver-worker
git pull
docker compose down
docker compose up -d --build --force-recreate
```

### Surveillance santé

```bash
# Stats pool
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/health | jq

# Total fetches faits depuis startup
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/health | jq .pool.total_fetches
```

### Restart worker (memory leak prévention)

Recommandé toutes les 7 jours via cron :
```cron
0 4 * * 0 cd /srv/keymatch/NextImmo-main/tools/zendriver-worker && docker compose restart
```

### Quand DataDome patche (tous les 1-3 mois)

1. Check si Zendriver a une nouvelle version : https://github.com/cdpdriver/zendriver/releases
2. Update `requirements.txt` → `zendriver==X.Y.Z`
3. `docker compose up -d --build --force-recreate`
4. Test live : `curl /fetch` URL réelle Leboncoin
5. Si toujours KO : check issues GitHub Zendriver pour "DataDome", ajuste `browser_args` dans `pool.py`
6. Worst case : flip `EXTERNAL_FETCHER_ENABLED_HOSTS=""` côté Vercel → UI redevient honnête "non supporté"

## Tests

### Locaux (sans browser)

```bash
pip install -r requirements.txt pytest
pytest test_worker.py -v
```

Attendu : ~15 tests OK (SSRF, allowlist, auth, soft-challenge).

### Live (avec browser, en local Docker)

```bash
docker compose up --build
# Dans un autre terminal :
TOKEN=$(grep FETCHER_TOKEN .env | cut -d= -f2)
curl -X POST http://localhost:8080/fetch \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"url":"https://abrahamjuliot.github.io/creepjs/"}' \
  -H "Content-Type: application/json"
```

CreepJS détecte le navigateur → bon test pour vérifier stealth + qu'on ne se fait pas catch.

## Codes d'erreur

| Code | HTTP | Signification | Action |
|---|---|---|---|
| `UNAUTHORIZED` | 401 | Bearer manquant ou faux | Sync tokens Vercel ↔ VPS |
| `RATE_LIMITED` | 429 | >60 req/h pour cette IP | Patience |
| `INVALID_URL` | 400 | URL malformée ou HTTP non-HTTPS | Côté client |
| `BLOCKED_HOST` | 400 | Host pas dans allowlist | Voir `ALLOW_HOSTS` |
| `BLOCKED_TLD` | 400 | TLD `.local` ou `.internal` | SSRF guard, normal |
| `PRIVATE_IP` | 400 | Host résout vers IP privée | SSRF guard |
| `DNS_FAILED` | 400 | Résolution DNS impossible | Vérif réseau VPS |
| `BOT_PROTECTION` | 502 | DataDome/Cloudflare a gagné | Update Zendriver, ou skip |
| `TIMEOUT` | 504 | Page trop lente / challenge non résolu | Augmenter `max_wait_ms` |
| `TOO_LARGE` | 413 | HTML > 5 MB | Anormal, investiguer |
| `FETCH_ERROR` | 502 | Erreur Zendriver (browser crashed?) | Check logs |
| `INTERNAL` | 500 | Bug worker | Check logs + report issue |

## Coût mensuel

- 0€ (tourne dans le VPS déjà payé pour KeyMatch en migration)
- ~3 GB RAM réservés pour le pool (sur 12 GB total VPS-2)
- Quelques CPU% par fetch (chromium léger en headless)

## Sécurité

- Bind localhost only (Caddy fait le reverse-proxy externe)
- Bearer token constant-time compare
- SSRF guard : private IPs, metadata cloud, .local TLDs
- Host allowlist explicite
- Rate-limit per-IP
- User non-root dans le container
- `cap_drop: ALL` + `no-new-privileges`
- `MemoryMax=4G` pour éviter OOM kill du host

## Limitations connues

- Zendriver ~75% succès sur DataDome 2026 (vs 30-60% Camoufox, vs 90%+ payant ScrapingBee). C'est la meilleure option gratuite.
- Casse tous les 1-3 mois quand DataDome update — prévoir 30 min maintenance.
- Pas de bypass CAPTCHA image (si DataDome escalade, fallback "saisie manuelle").
- Pool 3 contextes = 3 fetches simultanés max. Si Paul a besoin de plus, augmenter `POOL_SIZE` mais surveiller la RAM (chaque slot ~1 GB).
