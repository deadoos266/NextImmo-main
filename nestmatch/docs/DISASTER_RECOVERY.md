# KeyMatch Disaster Recovery Plan

État vivant. À mettre à jour quand le setup change.

## Scénarios couverts

1. [VPS OVH down (matériel)](#1-vps-down)
2. [Container Docker corrompu](#2-container-corrompu)
3. [Postgres data perdue / corrompue](#3-postgres-perdu)
4. [MinIO data perdue](#4-minio-perdu)
5. [Email provider down (Brevo / Resend)](#5-email-down)
6. [DNS down (OVH zone perdue)](#6-dns-down)
7. [SSH key Paul perdue](#7-ssh-key-perdue)
8. [GitHub repo perdu](#8-github-perdu)
9. [Cutover Vercel→VPS bug critique post-go-live](#9-rollback-cutover)

---

## 1. VPS down

**Symptômes** : keymatch-immo.fr renvoie timeout, `ping 149.202.60.152` KO.

**Diagnostic** :
1. Check OVH status page : https://status.ovh.com
2. Check OVH Manager → VPS → console
3. Si OVH dit "incident en cours" → attendre. Sinon, escalade.

**Action immédiate (< 5 min)** :
1. **Flip DNS A record** keymatch-immo.fr de IP VPS → IP Vercel (fallback) si Phase 6 active. TTL doit être bas (60s) pour cutover rapide.
2. Si Vercel project supprimé/expiré : redéploie depuis main branch (Vercel auto-deploy via GitHub).
3. Communiquer aux users : page de status, email Resend backup.

**Restore VPS** :
1. Si OVH peut réinstaller le VPS : profite pour repartir clean.
2. Provisionner un nouveau VPS-2 OVH (~15 min).
3. Bootstrap : `bash tools/zendriver-worker/bootstrap-vps.sh` (Phase 0 du plan migration).
4. Re-deploy chaque service :
   - Postgres : `cd tools/postgres-vps && ./scripts/restore-vps.sh ./backups/keymatch-postgres-<latest>.sql.gz`
   - MinIO : `cd tools/minio-vps && docker compose up -d` + restore depuis B2/OVH si data perdue
   - Next.js : `cd tools/next-vps && ./scripts/deploy.sh`
   - Realtime : `cd tools/realtime-vps && docker compose up -d`
   - Worker fetcher : `cd tools/zendriver-worker && docker compose up -d`
   - Crons : `cd tools/cron-vps && sudo ./scripts/install.sh`
5. Caddy : `sudo systemctl reload caddy` (auto-reload TLS Let's Encrypt si DNS pointait déjà ici)
6. Flip DNS A record retour vers nouveau VPS

**Temps de restauration cible** : 2h (avec backup B2 récent et clé SSH).

---

## 2. Container corrompu

**Symptômes** : `docker compose up -d` mais `docker logs` boucle d'erreurs, healthcheck KO, OOM kill.

**Action** :
```bash
ssh keymatch_vps
cd /opt/keymatch/NextImmo-main
sudo docker compose -f tools/<service>/docker-compose.yml down
sudo docker compose -f tools/<service>/docker-compose.yml up -d --force-recreate
```

Si toujours KO :
```bash
# Rebuild from scratch
sudo docker compose -f tools/<service>/docker-compose.yml build --no-cache
sudo docker compose -f tools/<service>/docker-compose.yml up -d
```

Si volume corrompu (rare) : voir scénario 3 / 4 selon le service.

---

## 3. Postgres data perdue/corrompue

**Symptômes** : `docker exec keymatch-postgres psql` renvoie erreurs, ou app affiche données incohérentes.

**Action** :
```bash
# 1. STOP les écritures (passe l'app en maintenance)
sudo docker compose -f tools/next-vps/docker-compose.yml down

# 2. Backup l'état courant (au cas où)
sudo docker compose -f tools/postgres-vps/docker-compose.yml exec postgres pg_dumpall -U keymatch > /tmp/keymatch-current-broken.sql

# 3. Stop Postgres
sudo docker compose -f tools/postgres-vps/docker-compose.yml down

# 4. Backup volume
sudo cp -r /srv/keymatch/postgres-data /srv/keymatch/postgres-data-broken-$(date +%s)

# 5. Wipe + restore from latest backup
sudo rm -rf /srv/keymatch/postgres-data/*
sudo docker compose -f tools/postgres-vps/docker-compose.yml up -d
sleep 30  # wait init
ls -lh /opt/keymatch/NextImmo-main/tools/postgres-vps/backups/  # ou depuis B2/OVH
cd /opt/keymatch/NextImmo-main/tools/postgres-vps
./scripts/restore-vps.sh ./backups/keymatch-postgres-<latest>.sql.gz

# 6. Test
docker exec keymatch-postgres psql -U keymatch keymatch -c "SELECT count(*) FROM annonces"

# 7. Restart le reste
sudo docker compose -f tools/next-vps/docker-compose.yml up -d
```

**Restore depuis B2/OVH Object Storage** :
```bash
rclone copy b2-keymatch:keymatch-backups/postgres/keymatch-postgres-<latest>.sql.gz ./
./scripts/restore-vps.sh ./keymatch-postgres-<latest>.sql.gz
```

**Perte data acceptable** : 24h (intervalle des backups). Si < 24h, conserver `postgres-data-broken-<ts>` et essayer pg_resetwal / pg_dump partial.

---

## 4. MinIO data perdue

**Symptômes** : `https://media.keymatch-immo.fr/avatars/x.jpg` retourne 404 alors que la row Postgres existe.

**Action** :
```bash
# Restore depuis backup B2/OVH (tarballs minio)
ssh keymatch_vps
cd /opt/keymatch/NextImmo-main/tools/postgres-vps
ls backups/keymatch-minio-*.tar.gz | head -3  # local
rclone ls b2-keymatch:keymatch-backups/minio/ | head -3  # offsite

# Stop MinIO
sudo docker compose -f tools/minio-vps/docker-compose.yml down

# Restore
cd /srv/keymatch
sudo mv minio-data minio-data-broken-$(date +%s)
sudo tar -xzf /opt/keymatch/NextImmo-main/tools/postgres-vps/backups/keymatch-minio-<latest>.tar.gz -C /srv/keymatch/
# Doit recréer /srv/keymatch/minio-data/

# Restart
sudo docker compose -f tools/minio-vps/docker-compose.yml up -d
sleep 10

# Test
curl -fI https://media.keymatch-immo.fr/avatars/  # 403 normal car bucket listing désactivé
```

**Alternative : re-migrate depuis Supabase Storage** (si toujours en parallèle dual-write Phase 3 transition) :
```bash
cd /opt/keymatch/NextImmo-main/tools/minio-vps
./scripts/migrate-from-supabase.sh
```

---

## 5. Email provider down

**Symptômes** : `/admin/operations` montre "Email: brevo (configured)" mais aucun email reçu. Brevo dashboard down.

**Action immédiate** :
1. Check Brevo status page : https://status.brevo.com
2. **Flip env Vercel** : `EMAIL_PROVIDER=resend` + redeploy (instantané ~1 min)
3. Vérifier `RESEND_API_KEY` toujours actif côté Resend dashboard

**Si Resend aussi down** : email impossible. Communiquer en in-app (notification cloche + page status).

---

## 6. DNS down

**Symptômes** : `dig keymatch-immo.fr` ne résout pas, OVH zone DNS UI inaccessible.

**Action** :
1. Check OVH status : https://status.ovh.com (DNS = service Cloud)
2. Si OVH incident : attendre
3. Si zone DNS perdue : reconstruire depuis backup (cf 8)
4. Pendant la coupure DNS : les users qui ont déjà résolu (cache local DNS) continuent d'accéder. Nouveaux visiteurs : KO.

**Backup zone DNS** : faire un dump mensuel via OVH API et stocker dans repo Git :
```bash
# À ajouter en script tools/dns-backup/zone-dump.sh
# Pour V97.39.x : faire manuellement via OVH Manager → Web Cloud → Domain → Zone DNS → Export
```

---

## 7. SSH key Paul perdue

**Symptômes** : `ssh -i $HOME\.ssh\keymatch_vps ubuntu@149.202.60.152` rejette la clé.

**Action** :
1. Si Paul a perdu le fichier `keymatch_vps` mais a accès au mot de passe OVH initial : reset password via OVH Manager → VPS → Réinitialiser mot de passe root.
2. Connect via mot de passe one-shot, copier nouvelle clé publique dans `~ubuntu/.ssh/authorized_keys`, désactiver password auth.
3. Si tout perdu : OVH Manager → VPS → KVM console → password recovery mode → modifier le fichier authorized_keys via le système rescue.

**Prévention** : Paul a **2 copies** de la clé privée :
- `$HOME\.ssh\keymatch_vps` sur PC principal
- Backup chiffré (clé USB ou password manager 1Password / Bitwarden)

---

## 8. GitHub repo perdu

**Symptômes** : github.com/deadoos266/NextImmo-main down ou repo supprimé.

**Action** :
1. Vérifier : tout commit pushé existe en local sur PC Paul (.git/) ET sur le VPS (/opt/keymatch/NextImmo-main/.git/)
2. Re-push vers nouveau remote :
   ```bash
   # Sur PC Paul
   git remote set-url origin https://github.com/<new-account>/keymatch.git
   git push -u origin main
   ```
3. Re-configure Vercel + tools VPS pour nouveau remote.

**Prévention** : faire un mirror weekly sur GitLab/Codeberg/self-host Gitea (V2).

---

## 9. Rollback cutover Vercel→VPS

**Symptômes** : après cutover Phase 6, erreurs 500 sur > 5% des requêtes, Sentry spike, ou feature critique cassée.

**Action immédiate (< 5 min)** :
1. Flip A record DNS `keymatch-immo.fr` de IP VPS → IP Vercel (TTL 60s = propagation 1-5 min)
2. Vérifie : `curl -L https://keymatch-immo.fr/api/health` → arrive sur Vercel
3. Investiguer côté VPS : `docker logs -f keymatch-next` + Sentry
4. Garder VPS up pour debug ; quand fix prêt, re-flip DNS

**Conditions de rollback** :
- Taux d'erreur 5xx > 2% pendant 30 min
- Feature critique cassée (login, bail, EDL, messages)
- Performance dégradée > 50% (TTFB > 2s)

**Période de double-config recommandée** :
- Vercel projet actif pendant **30 jours** après cutover Phase 6
- TTL DNS bas (60s) pendant **48h** post-cutover

---

## Contacts d'urgence

| Service | Login | Mot de passe location | Téléphone |
|---|---|---|---|
| OVH VPS | tic3467@gmail.com | OVH 2FA app | Support OVH : 1007 |
| Vercel | tic3467@gmail.com | Vercel SSO via Google | Support payant |
| Supabase | tic3467@gmail.com | Supabase SSO | Pas de tel |
| Brevo | tic3467@gmail.com | Brevo SSO | Pas de tel |
| GitHub | deadoos266 | 2FA app | Pas de tel |
| Resend | tic3467@gmail.com | Resend SSO | Pas de tel |

## Surveillance

| Outil | URL | Note |
|---|---|---|
| Sentry | https://sentry.io | Errors + perf |
| UptimeRobot | https://uptimerobot.com | Ping /api/health toutes 5min |
| /admin/health | https://keymatch-immo.fr/admin/health | Vue interne services |
| /admin/releases | https://keymatch-immo.fr/admin/releases | Validations Paul post-push |

## Tests de DR (Disaster Recovery Drills)

Une fois par trimestre :
- [ ] Restore Postgres depuis backup B2 sur un container temp → row counts match
- [ ] Provisionner un VPS-2 OVH propre + bootstrap + restore complet → keymatch-immo.fr-clone accessible en < 4h
- [ ] Flip DNS A record vers le clone → users redirigés
- [ ] Tester chaque scénario 1-9 mentalement (table-top exercise)
