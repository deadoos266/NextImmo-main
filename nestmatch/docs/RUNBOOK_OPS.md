# RUNBOOK OPS — KeyMatch VPS OVH

Procédures courantes pour gérer le VPS OVH (worker Zendriver) et les services KeyMatch sans dépendre de Claude.

Mis à jour : 2026-05-17 (Phase 1 livrée).

---

## 🔑 Accès SSH au VPS

```powershell
# Depuis PowerShell Windows
ssh -i $HOME\.ssh\keymatch_vps ubuntu@149.202.60.152
```

**Important** : la clé privée est dans `C:\Users\Paul\.ssh\keymatch_vps`. **Sauvegarde-la dans un gestionnaire de mots de passe** (Bitwarden, 1Password). Si tu perds ce fichier, plus aucun accès au VPS (password désactivé).

### Si la clé est perdue

1. https://www.ovhcloud.com/manager → VPS → ton VPS → **Console KVM** (rescue mode)
2. Boot en rescue → monter le disk → ajouter une nouvelle clé SSH publique à `/home/ubuntu/.ssh/authorized_keys`
3. Reboot → ré-accès SSH

**Procédure complète documentée par OVH** : https://help.ovhcloud.com/csm/fr-vps-rescue-mode

---

## 🔧 Worker Zendriver — opérations courantes

Toutes ces commandes s'exécutent **après SSH sur le VPS** (`ubuntu@vps-c6fb461c:~$`).

### Voir les logs en temps réel

```bash
cd /opt/keymatch/NextImmo-main/tools/zendriver-worker
sudo docker compose logs -f worker
```

`Ctrl+C` pour sortir.

### Voir les 50 derniers logs (sans suivre)

```bash
sudo docker compose logs --tail=50 worker
```

### Restart le worker (sans changement de code)

```bash
sudo docker compose restart
# Attendre 30s pour que le pool 3 contextes Zendriver soit prêt
```

### Update le worker (après git push KeyMatch)

```bash
cd /opt/keymatch/NextImmo-main && git pull
cd tools/zendriver-worker && sudo docker compose up -d --build
```

Si le `requirements.txt` ou `Dockerfile` a changé, le build télécharge ~250 MB Chromium (5-8 min).

### Vérifier que le worker est healthy

```bash
TOKEN=$(grep FETCHER_TOKEN /opt/keymatch/NextImmo-main/tools/zendriver-worker/.env | cut -d= -f2)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/health | jq
```

Sortie attendue :
```json
{"ok":true,"uptime_s":1234,"pool":{"size":3,"in_flight":0,"total_fetches":42,...}}
```

### Tester un fetch live depuis le VPS

```bash
TOKEN=$(grep FETCHER_TOKEN /opt/keymatch/NextImmo-main/tools/zendriver-worker/.env | cut -d= -f2)
curl -s -X POST http://localhost:8080/fetch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.leboncoin.fr/ad/locations/..."}' | jq '.ok, .code, .html | length'
```

Réponses possibles :
- `{"ok": true, ...}` → bypass réussi (rare avec ASN OVH actuel)
- `{"ok": false, "code": "BOT_PROTECTION"}` → DataDome a bloqué (attendu actuellement)
- `{"ok": false, "code": "TIMEOUT"}` → page trop lente
- `{"ok": false, "code": "RATE_LIMITED"}` → trop de fetches/h sur cette IP

### Stats du pool

```bash
sudo docker compose ps          # status container
sudo docker stats keymatch-fetcher --no-stream  # CPU/RAM
```

RAM steady-state attendue : ~2-3 GB (3 contextes Chromium warm).

---

## 🔄 Rotation du FETCHER_TOKEN

À faire tous les 6 mois ou si tu suspectes une fuite.

```bash
# Sur le VPS
NEW_TOKEN=$(openssl rand -hex 32)
sudo sed -i "s|^FETCHER_TOKEN=.*|FETCHER_TOKEN=$NEW_TOKEN|" /opt/keymatch/NextImmo-main/tools/zendriver-worker/.env
sudo docker compose restart
echo "Nouveau token : $NEW_TOKEN"
```

**Puis update Vercel env** (https://vercel.com/dashboard → keymatch → Settings → Environment Variables) :
- Edit `EXTERNAL_FETCHER_TOKEN` → coller `$NEW_TOKEN`
- Save
- Trigger un redeploy (commit vide ou bouton "Redeploy" dans Deployments)

Pendant la fenêtre entre 2 et 4 (token VPS changé mais Vercel pas encore redeployed) : les imports DataDome retournent 401 `UNAUTHORIZED`. Le circuit breaker quarantaine peut s'activer. Reset après redeploy via `/api/admin/imports/reset-quarantine`.

---

## 🚨 Incidents — debug rapide

### Symptôme : worker répond 502/504 dans /api/health/full

1. SSH au VPS et check container :
   ```bash
   cd /opt/keymatch/NextImmo-main/tools/zendriver-worker
   sudo docker compose ps
   ```

2. Si `restarting` ou `exited` → check logs :
   ```bash
   sudo docker compose logs --tail=200 worker | tail -50
   ```

3. Cas fréquents :
   - **OOM** : Chromium a planté en mémoire. `sudo docker compose down && sudo docker compose up -d --build`
   - **Zendriver crash** : nouvelle version de Chromium. `sudo docker compose up -d --build --force-recreate`
   - **Caddy TLS expired** : reload Caddy : `sudo systemctl reload caddy`
   - **Disk full** : `df -h` → `docker system prune -a -f` (libère 5-10 GB d'images obsolètes)

### Symptôme : utilisateurs voient "Service indisponible" sur /proprietaire/ajouter

1. Check si Vercel sait joindre le worker :
   - https://keymatch-immo.fr/admin/imports → card "Worker Zendriver"
   - Status attendu : `✓ Opérationnel`, latence < 500ms
   - Si "✗ Injoignable" → problème DNS, Caddy ou worker

2. Si DNS cassé : `dig fetcher.keymatch-immo.fr` → doit retourner `149.202.60.152`. Sinon check OVH zone DNS.

3. Si Caddy cassé : SSH VPS → `sudo systemctl status caddy` → `sudo journalctl -u caddy -n 50`

4. Si worker injoignable depuis Vercel mais OK depuis VPS local :
   - UFW : `sudo ufw status` (80/443 ouvert ?)
   - Caddy : `sudo cat /etc/caddy/Caddyfile` (config présente ?)

### Symptôme : 5+ BOT_PROTECTION en 1h → users voient "site bloque depuis 1h"

C'est le circuit breaker V97.39.5 qui s'est activé. Pour le reset :

**Option A — Reset manuel (cache mémoire)** :
```bash
# Depuis ton browser admin sur /admin (logged in)
# Trigger une requête POST manuellement via DevTools console :
fetch("/api/admin/imports/reset-quarantine", { method: "POST" }).then(r => r.json()).then(console.log)
```

**Option B — Reset auto** : attendre 1h (window glissante), le circuit reset tout seul si moins de 5 fails dans la dernière heure.

**Option C — Désactiver le routing worker** (si DataDome bloque vraiment tout le temps) :
- Vercel env vars → `EXTERNAL_FETCHER_ENABLED_HOSTS` → mettre `""` (vide)
- Redeploy
- Les URLs LBC/SeLoger/Logic-immo passent par wreq-js direct → BOT_PROTECTION immédiat (pas de 25s wait)
- Worker reste up sur VPS, prêt si tu réactives

---

## 🔄 Backups

Actuellement : pas de backup automatique côté VPS (rien à backuper, le worker est stateless et `import_jobs` est éphémère).

**Côté Supabase prod** : Phase 8 du plan migration prévoit `pg_dump` quotidien vers Backblaze B2. À implémenter quand on attaque Phase 2 (Postgres self-host).

Pour un dump ad-hoc Supabase aujourd'hui :
- Dashboard Supabase → projet → Settings → Database → Connection String
- Depuis ta machine locale Windows :
  ```powershell
  # Installer Postgres client si pas déjà fait
  # pg_dump "postgresql://..." > backup-$(Get-Date -Format yyyy-MM-dd).sql
  ```

---

## 📊 Monitoring

### Dashboards à consulter régulièrement

- **https://keymatch-immo.fr/admin/health** — santé 7 services (DB, Auth, Email, Storage, Crons, App, **Fetcher**)
- **https://keymatch-immo.fr/admin/imports** — stats imports + santé worker + alertes parsers
- **https://keymatch-immo.fr/admin/operations** — historique exécutions crons
- **https://keymatch-immo.fr/status** — version publique health (utile pour rassurer users en cas d'incident)
- **Vercel dashboard** → keymatch → Logs/Functions → erreurs serveur
- **Sentry** → events tag `feature:import-annonce` → bugs réels

### Cron schedules

- `/api/cron/fetcher-health` : toutes 6h (00h/06h/12h/18h UTC)
- `/api/cron/import-jobs-cleanup` : daily à 4h15 UTC
- `/api/cron/health-check` : hourly (déjà existant)
- Les 22 crons totaux : voir `vercel.json`

### Alertes auto-créées

- **Worker down 3+ fois consécutives sur 18h** : incident `severity=major service=fetcher is_public=false` → visible dans `/admin`
- **Worker > 50% fail sur 7j avec >=10 imports** : alerte dans `/admin/imports`
- **Parser dégradé > 50% fail sur 7j** : pareil

---

## 🛠️ Maintenance préventive

### Mensuel

- Check `/admin/health` → tous services "up"
- Check `df -h` sur VPS → disque < 70%
- Check `sudo docker system df` → cleanup images si > 30 GB
- Update worker : `git pull && docker compose up -d --build` (catch les fixes upstream)

### Trimestriel

- Update Zendriver version : `pip install --upgrade zendriver` → rebuild Docker
- Rotation des secrets : FETCHER_TOKEN + autres tokens API
- Review usage CPU/RAM sur 30 jours (surveiller saturation à anticiper)

### Quand DataDome assouplit (à monitorer)

Si `/admin/imports` montre que le worker commence à réussir sur Leboncoin/SeLoger :
1. Reset cache quarantaine : POST `/api/admin/imports/reset-quarantine`
2. Surveiller le taux de succès sur 24h
3. Si > 30% → garder activé, c'est utile
4. Si < 10% → ré-évaluer (peut-être faux positifs)

---

## 🆘 Si tout casse

### Plan B 1 — Désactiver le worker, retour à V97.38

1. Vercel env vars → `EXTERNAL_FETCHER_ENABLED_HOSTS = ""` → Save
2. Redeploy Vercel
3. LBC/SeLoger/Logic-immo retournent BOT_PROTECTION immédiat (pas de 25s)
4. PAP + 12 agences continuent de marcher normalement

### Plan B 2 — Stop le VPS pour économie temporaire

Si tu veux pas payer 12€/mois pendant un congé long :
1. https://www.ovhcloud.com/manager → VPS → Stop (état "Arrêté", pas de facturation suspendue mais bandwidth zéro)
2. Faire d'abord Plan B 1 pour pas que les users attendent 25s timeout
3. Pour redémarrer : OVH → VPS → Start. Worker redémarre auto via Docker Compose `restart: unless-stopped`.

### Plan B 3 — Migration vers autre hébergeur

Si OVH a un problème grave (sécurité, prix, etc.) :
1. Commander VPS Hetzner CCX13 (8GB ARM, 13€/mois) ou similaire
2. Lancer le bootstrap script : `bash bootstrap-vps.sh`
3. Mettre à jour le A record DNS `fetcher.keymatch-immo.fr` → nouvelle IP
4. Update FETCHER_TOKEN si voulu
5. 30 min de chantier complet

Le code est portable, le bootstrap idempotent.

---

## 📞 Ressources externes

- **OVH VPS docs** : https://help.ovhcloud.com/csm/fr-vps
- **Caddy docs** : https://caddyserver.com/docs/
- **Zendriver issues** (quand DataDome patche) : https://github.com/cdpdriver/zendriver/issues
- **Vercel logs** : https://vercel.com/deadoos266/next-immo-main/logs
- **Supabase logs** : Dashboard → Logs → API/Postgres/Auth
- **Sentry events** : Dashboard → Issues → filter `feature:import-annonce`

---

**Quand mettre à jour ce doc ?** Quand tu ajoutes un nouveau service, change une procédure, ou découvres un nouveau pattern de debug.

---

## V97.39.21 — Procédures ajoutées pour Phases 3-9 du plan migration OVH

### Liste des services VPS (état cible Phase 6+)

| Service | Container | Port (localhost) | Phase | Domaine |
|---|---|---|---|---|
| Postgres | keymatch-postgres | 5432 | 2 | (interne) |
| MinIO API | keymatch-minio | 9000 | 3 | media.keymatch-immo.fr |
| MinIO console | keymatch-minio | 9001 | 3 | media-admin.keymatch-immo.fr |
| Next.js | keymatch-next | 3000 | 6 | keymatch-immo.fr |
| Realtime socket.io | keymatch-realtime | 3001 | 4 | ws.keymatch-immo.fr |
| Worker Zendriver | keymatch-fetcher | 8080 | 1 | fetcher.keymatch-immo.fr |
| Caddy | (système) | 80/443 | 0 | reverse-proxy |

### Deploy après push main (Phase 6 active)
```bash
ssh -i $HOME\.ssh\keymatch_vps ubuntu@149.202.60.152
sudo systemctl start keymatch-next-deploy.service
tail -f /var/log/keymatch-deploy.log
```

### Inspecter Postgres
```bash
docker exec -it keymatch-postgres psql -U keymatch keymatch
# Quick stats
docker exec keymatch-postgres psql -U keymatch keymatch -c \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10"
```

### Inspecter MinIO
```bash
# Console web
open https://media-admin.keymatch-immo.fr/   # Login = MINIO_ROOT_USER/PASSWORD
# CLI
docker run --rm --network keymatch-minio-net \
  -e MC_HOST_local="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
  minio/mc ls local
```

### Inspecter Realtime
```bash
curl https://ws.keymatch-immo.fr/health | jq
docker logs -f --tail 100 keymatch-realtime
```

### Modifier les crons
1. Édite `tools/cron-vps/cron-routes.tsv`
2. Push main
3. Sur VPS : `git pull && bash tools/cron-vps/scripts/generate-systemd-units.sh && sudo bash tools/cron-vps/scripts/install.sh`

### Rotater un secret critique
Procédure détaillée par secret dans `docs/SECRETS_INVENTORY.md`.

### Scénarios disaster recovery
Cf `docs/DISASTER_RECOVERY.md` : VPS down, container corrompu, Postgres perdu, MinIO perdu, email provider down, DNS perdu, SSH key perdue, GitHub perdu, rollback cutover.

### Variables d'env cheat sheet
| Var | Localisation | Description |
|---|---|---|
| `NEXTAUTH_SECRET` | Vercel + VPS /etc/keymatch.env | Sign sessions + JWT realtime |
| `DATABASE_URL` | Vercel + VPS | Postgres connection |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel | Bypass RLS Supabase |
| `RESEND_API_KEY` / `BREVO_API_KEY` | Vercel | Email |
| `STORAGE_PROVIDER` + `MINIO_*` | Vercel | Storage Phase 3 |
| `EMAIL_PROVIDER` | Vercel | Email Phase 5 |
| `NEXT_PUBLIC_REALTIME_PROVIDER` + `_URL` | Vercel | Realtime Phase 4 |
| `CRON_SECRET` | Vercel + VPS | Auth crons |
| `EXTERNAL_FETCHER_TOKEN` | Vercel + VPS worker | Auth worker fetcher |

Inventaire détaillé : `docs/SECRETS_INVENTORY.md`.
