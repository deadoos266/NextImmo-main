# KeyMatch MinIO self-host — Phase 3 du plan migration OVH

Stockage S3-compatible self-host pour remplacer Supabase Storage.

## Pour quoi
- **Indépendance Supabase** : Phase 3 du plan `nestmatch/docs/MIGRATION_OVH_COMPLETE_PLAN.md`
- **Volumétrie cible** : <5 GB (photos annonces + dossier docs + baux PDF + EDL photos)
- **Coût** : 0€ (tourne sur le VPS existant)
- **RGPD** : données en EU, sous notre contrôle

## État actuel (préparation, ZÉRO risque prod)

Ce dossier contient :
- `docker-compose.yml` : services minio + minio-init (idempotent)
- `.env.example` : variables d'env attendues
- `scripts/init-buckets.sh` : crée les 7 buckets + policies (idempotent)
- `scripts/migrate-from-supabase.sh` : copie data via rclone (multi-run safe)
- `scripts/rewrite-storage-urls.sql` : update URLs en base post-cutover
- `Caddyfile.fragment` : reverse-proxy `media.keymatch-immo.fr` + `media-admin.`

**Ce dossier ne fait RIEN tant que :**
1. `.env` n'est pas créé avec MINIO_ROOT_PASSWORD
2. `docker compose up -d` n'est pas lancé sur le VPS
3. `STORAGE_PROVIDER=minio` n'est pas set côté Vercel

## Buckets KeyMatch

| Bucket | Visibilité | Contenu | Migration depuis Supabase |
|---|---|---|---|
| `avatars` | Public | Photos profil utilisateurs | `avatars/` |
| `annonces-photos` | Public | Photos annonces + photos EDL pièces | `annonces-photos/` |
| `dossiers` | Privé | CNI, fiches paie, avis d'imposition, garants | `dossiers/` |
| `baux` | Privé | PDF baux signés + annexes | `baux/` |
| `edl` | Privé | PDF EDL signés | `edl/` |
| `quittances` | Privé | PDF quittances mensuelles | `quittances/` |
| `messages-images` | Privé | Pièces jointes chat | `messages-images/` |
| `bug-screenshots` | Privé | Screenshots admin bug reports | `bug-screenshots/` |

## Procédure complète activation (~2-3h)

### Phase A — Setup VPS MinIO (30 min)

```bash
# Connect au VPS
ssh -i $HOME\.ssh\keymatch_vps ubuntu@149.202.60.152

# Pull derniers fichiers
cd /opt/keymatch/NextImmo-main && git pull

# Setup MinIO
cd tools/minio-vps
cp .env.example .env

# Générer mdp solide
echo "MINIO_ROOT_PASSWORD=$(openssl rand -base64 32)" >> .env
# Et adapter les URLs prod :
#   MINIO_SERVER_URL=https://media.keymatch-immo.fr
#   MINIO_CONSOLE_URL=https://media-admin.keymatch-immo.fr
nano .env

# Crée volume data
sudo mkdir -p /srv/keymatch/minio-data
sudo chown -R 1000:1000 /srv/keymatch/minio-data

# Lance
sudo docker compose up -d
sudo docker compose logs -f minio
# Attends "MinIO Object Storage Server" + "API: http://...:9000"
# Ctrl+C
```

### Phase B — DNS (15 min, propagation 15min-2h)

Dans OVH Manager → Web Cloud → Noms de domaine → keymatch-immo.fr → Zone DNS :

```
A  media          → 149.202.60.152  (TTL 600)
A  media-admin    → 149.202.60.152  (TTL 600)
```

Test : `dig +short media.keymatch-immo.fr` → doit retourner `149.202.60.152`.

### Phase C — Caddy reverse proxy (15 min)

```bash
# Sur le VPS
sudo cat /opt/keymatch/NextImmo-main/tools/minio-vps/Caddyfile.fragment >> /etc/caddy/Caddyfile

# Génère le hash bcrypt pour basic auth console admin
caddy hash-password
# Copie le hash dans /etc/caddy/Caddyfile (remplace REMPLACER_PAR_HASH_BCRYPT_PAUL)
sudo nano /etc/caddy/Caddyfile

# Reload
sudo systemctl reload caddy
sudo journalctl -u caddy -f --since "-1m"
# Attends "certificate obtained successfully" pour les 2 domaines
```

Test : `curl -fI https://media.keymatch-immo.fr/avatars/` → 403 attendu (bucket vide) ou 200.

### Phase D — Init buckets (5 min)

Normalement déjà fait au premier `docker compose up -d` via le service
`minio-init`. Pour vérifier :

```bash
cd /opt/keymatch/NextImmo-main/tools/minio-vps
./scripts/init-buckets.sh
# Doit afficher "✓ Buckets initialisés" + liste des 8 buckets
```

### Phase E — Migration data depuis Supabase (30-60 min selon volume)

```bash
# Récupère les S3 Access Keys Supabase :
#   Supabase Dashboard → Project Settings → Storage → S3 Access Keys → Create
# Ajoute dans .env :
#   SUPABASE_URL=https://wzzibgdupycysvtwsqxo.supabase.co
#   SUPABASE_S3_ACCESS_KEY=<from dashboard>
#   SUPABASE_S3_SECRET_KEY=<from dashboard>
nano .env

# Lance la migration (rclone, multi-run safe)
./scripts/migrate-from-supabase.sh

# Vérifie un sample
docker run --rm --network keymatch-minio-net \
  -e MC_HOST_local="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
  minio/mc ls local/annonces-photos | head
```

### Phase F — Rewrite URLs en base (10 min)

⚠ TIME BLOCKING. Faire pendant une fenêtre de maintenance courte (~1 min).
Pendant cette minute, les utilisateurs verront `<img>` cassées si Supabase
est coupé. Pour zéro coupure : faire la rewrite **avant** de couper Supabase
Storage (les fichiers existent dans les 2 endroits).

```bash
# DRY-RUN d'abord
psql "$DATABASE_URL" -v dry_run=1 -f /opt/keymatch/NextImmo-main/tools/minio-vps/scripts/rewrite-storage-urls.sql
# Vérifie les counts (combien de rows par table à rewrite)

# Si OK :
psql "$DATABASE_URL" -v dry_run=0 -f /opt/keymatch/NextImmo-main/tools/minio-vps/scripts/rewrite-storage-urls.sql
# À la fin : COMMIT;  (ou ROLLBACK; si still_to_rewrite > 0)
```

### Phase G — Switch côté Vercel (5 min)

```bash
# Sur la machine de Paul (PowerShell ou bash)
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner --workspace=nestmatch
# Commit + push (Vercel rebuild)
```

Vercel Dashboard → Settings → Environment Variables (Production + Preview) :

| Variable | Valeur |
|---|---|
| `STORAGE_PROVIDER` | `minio` |
| `MINIO_ENDPOINT` | `https://media.keymatch-immo.fr` |
| `MINIO_PUBLIC_URL` | `https://media.keymatch-immo.fr` |
| `MINIO_ACCESS_KEY` | `keymatch` |
| `MINIO_SECRET_KEY` | `<MINIO_ROOT_PASSWORD du .env VPS>` |
| `MINIO_REGION` | `us-east-1` |

Redeploy production.

### Phase H — Test régression (30 min)

- [ ] Voir une annonce avec photos → photos s'affichent depuis media.keymatch-immo.fr
- [ ] Voir un avatar profil → idem
- [ ] Télécharger un bail PDF → signed URL marche
- [ ] Télécharger une quittance → idem
- [ ] Upload nouvelle photo annonce → bucket MinIO contient le fichier
- [ ] Upload nouveau dossier doc → idem
- [ ] Bug report avec screenshot → s'upload
- [ ] /admin/operations → "Storage: minio (configured)"

### Phase I — Rollback si problème

Flip `STORAGE_PROVIDER=supabase` dans Vercel + redeploy.
Les fichiers Supabase Storage sont conservés intacts pendant 30 jours
(pas supprimés par le script de migration, juste copiés).

Pour annuler le SQL rewrite :
```bash
# Si la transaction est encore ouverte
ROLLBACK;
# Sinon, restore depuis le pg_dump pré-migration :
pg_dump -h supabase-host annonces baux edl_pieces ... > pre-rewrite-backup.sql
# Et restore les colonnes une par une via UPDATE
```

## Désinstaller (revert clean)

```bash
docker compose down -v   # supprime aussi le volume éphémère minio-init
sudo rm -rf /srv/keymatch/minio-data
rm -f .env
# DNS : retirer A records media.* dans OVH zone
# Caddy : retirer fragment de /etc/caddy/Caddyfile + reload
```

## Coûts ajoutés

Aucun. MinIO tourne sur le VPS-2 existant (utilise ~500 MB RAM + le volume disque
qui est inclus dans les 100 GB NVMe).

## Inclus dans les backups

Le volume `/srv/keymatch/minio-data` est inclus automatiquement dans
`tools/postgres-vps/scripts/backup-daily.sh` (Phase 8 backups B2/OVH).
Cf cette section quand on wire le tar du volume.
