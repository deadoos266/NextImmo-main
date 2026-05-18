# Supabase Realtime self-host — Phase 7b KeyMatch

Remplace `https://<projet>.supabase.co/realtime/v1/*` par l'image officielle
`supabase/realtime` branchée sur `keymatch-postgres`.

## Pré-requis

1. `keymatch-postgres` redémarré avec `wal_level=logical` (cf
   `tools/postgres-vps/docker-compose.yml` mis à jour).

   Vérification :
   ```bash
   sudo docker exec keymatch-postgres psql -U keymatch -d keymatch -c "SHOW wal_level"
   # → "logical"
   ```

2. PostgREST déployé (Phase 7a) avec `POSTGREST_JWT_SECRET` connu.

## Setup (~30 min)

### 1. Redémarrer Postgres en wal_level=logical

```bash
ssh ubuntu@149.202.60.152
cd /opt/keymatch/NextImmo-main && sudo git pull
cd tools/postgres-vps
sudo docker compose down
sudo docker compose up -d
# Attends "database system is ready"
sudo docker exec keymatch-postgres psql -U keymatch -d keymatch -c "SHOW wal_level"
```

⚠ Downtime DB ~10s pendant le restart. Si trafic prod actif, faire en fenêtre.

### 2. Init role + publication SQL

```bash
cd /opt/keymatch/NextImmo-main/tools/supabase-realtime-vps
sudo docker exec -i keymatch-postgres psql -U keymatch -d keymatch < scripts/init-realtime-role.sql
```

### 3. Préparer .env

```bash
sudo cp .env.example .env
# Génère les secrets
REALTIME_DB_PWD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40)
REALTIME_ENC=$(openssl rand -hex 8)        # 16 chars exactement
REALTIME_SKB=$(openssl rand -hex 32)       # 64 chars
POSTGREST_JWT=$(grep POSTGREST_JWT_SECRET ../postgrest-vps/.env | cut -d= -f2)

sudo tee .env > /dev/null <<EOF
REALTIME_DB_PASSWORD=$REALTIME_DB_PWD
REALTIME_ENC_KEY=$REALTIME_ENC
REALTIME_SECRET_KEY_BASE=$REALTIME_SKB
POSTGREST_JWT_SECRET=$POSTGREST_JWT
EOF
```

### 4. Set password rôle DB

```bash
sudo bash scripts/set-realtime-password.sh
```

### 5. Démarre Realtime

```bash
sudo docker compose up -d
sudo docker compose logs -f
# Attends "Realtime listening on 4000"
```

### 6. Branche Caddy

Le fragment `tools/postgrest-vps/Caddyfile.fragment` route déjà
`/realtime/v1/*` → `keymatch-supabase-realtime:4000`. Vérifier que Caddy
est rechargé après ajout.

## Rollback

```bash
# Stop le container
sudo docker compose -f tools/supabase-realtime-vps/docker-compose.yml down

# Côté code : flip NEXT_PUBLIC_SUPABASE_URL back vers Supabase Cloud
# (réactive realtime sur cloud)
```

## Tables couvertes par la publication

- messages, notifications, visites, annonces
- bail_signatures, edl_signatures, contacts, signalements
- etats_des_lieux, loyers

Ajout d'une nouvelle table avec realtime :
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE ma_table;
ALTER TABLE ma_table REPLICA IDENTITY FULL;
```
