# KeyMatch Postgres self-host — Phase 2 du plan migration OVH

Setup d'une instance Postgres 16 dans Docker sur le VPS OVH, prête à
recevoir un dump du Supabase actuel.

## Pour quoi
- **Indépendance Supabase** : Phase 2 du plan `docs/MIGRATION_OVH_COMPLETE_PLAN.md`
- **Volumétrie cible** : 17 MB total, 36 tables, 1882 rows (audit 2026-05-17)
- **Migration < 60s** (dump + restore + compare)
- **Coexiste** avec keymatch-fetcher (worker Zendriver) sur le même VPS

## État actuel (préparation, sans risque prod)

Ce dossier contient :
- `docker-compose.yml` : services postgres + pgbouncer (pas démarrés en prod)
- `init-extensions.sql` : extensions Postgres requises (pgcrypto, uuid-ossp, pg_stat_statements)
- `scripts/dump-supabase.sh` : pg_dump Supabase prod → fichier local
- `scripts/restore-vps.sh` : charge le dump dans Postgres VPS local
- `scripts/compare-rows.sh` : valide row counts identiques avant cutover

**Ce dossier ne fait RIEN tant que :**
1. `.env` n'est pas créé avec POSTGRES_PASSWORD + SUPABASE_DB_URL
2. `docker compose up -d` n'est pas lancé

## Procédure migration Phase 2 complète (~2h le jour J)

### Pré-requis
- VPS OVH up (cf. `tools/zendriver-worker/README.md` pour le bootstrap initial)
- Docker + Docker Compose installés (déjà fait par bootstrap-vps.sh)
- Accès Supabase Project Settings → Database → Connection String

### Étape 1 — Setup local (30 min, zéro risque)

Sur ta machine de dev (ou sur le VPS) :

```bash
cd tools/postgres-vps
cp .env.example .env
# Édite .env :
#   POSTGRES_PASSWORD=$(openssl rand -base64 32)
#   SUPABASE_DB_URL=postgresql://postgres.wzzibgdupycysvtwsqxo:<password>@<host>:5432/postgres
nano .env

docker compose up -d
docker compose logs -f postgres
# Attends "database system is ready to accept connections"
# Ctrl+C pour quitter les logs

# Test connexion
docker compose exec postgres psql -U keymatch -d keymatch -c "SELECT version()"
```

### Étape 2 — Dump + restore en local (5 min, zéro risque)

```bash
./scripts/dump-supabase.sh
# → dumps/keymatch-supabase-YYYY-MM-DD-HHmm.sql.gz (~2-5 MB)

./scripts/restore-vps.sh
# → écrit dans Postgres local, idempotent

./scripts/compare-rows.sh
# → table par table, doit afficher diff=0 partout
```

### Étape 3 — Test régression KeyMatch (30 min)

Lance Next.js en local avec `DATABASE_URL=postgresql://keymatch:PASS@localhost:5432/keymatch` :

```bash
cd ../../nestmatch
DATABASE_URL=postgresql://keymatch:$(grep POSTGRES_PASSWORD ../tools/postgres-vps/.env | cut -d= -f2)@localhost:5432/keymatch \
  npm run dev
```

Test manuel : login, profil, annonce, candidature, message, bail, EDL.
Si tout marche → on est prêt pour le cutover prod.

### Étape 4 — Cutover prod (10 min + 30 min surveillance)

⚠ Faire dimanche matin / soir avec backup. Pendant les 30 min suivantes :
trafic peut continuer à écrire dans Supabase, on perdra les inserts.
Solution : maintenance mode brief ou dual-write.

Recommandation : **dual-write progressive sur 1 semaine** (Next.js écrit
dans les 2 DBs) avant le switch READ. Plan détaillé dans
`docs/MIGRATION_OVH_COMPLETE_PLAN.md` section Phase 2.

### Étape 5 — Backups B2 (1h, Phase 8)

```bash
# Sur le VPS, cron quotidien 3h :
0 3 * * * cd /srv/keymatch/postgres-vps && \
  docker compose exec -T postgres pg_dump -U keymatch keymatch | \
  gzip | rclone rcat b2:keymatch-backups/postgres-$(date +\%Y-\%m-\%d).sql.gz
```

## Audit Supabase 2026-05-17

Voir `docs/supabase-audit-2026-05-17.txt` (généré par Management API).

Highlights :
- **5 extensions** : pgcrypto, uuid-ossp, pg_stat_statements (standard) + plpgsql + supabase_vault (non utilisé, skip safe)
- **5 RLS policies** seulement (sécurité majeure côté Vercel routes, pas DB)
- **11 fonctions custom** (toutes simples : triggers + counter increments)
- **10 tables Realtime** : annonces, messages, loyers, visites, etats_des_lieux, signalements, contacts, notifications, bail_signatures, edl_signatures
  → **Phase 4 nécessaire** avant de couper Supabase totalement (socket.io custom)
- Volume **17 MB total**, peu de pression mémoire (VPS-2 12GB suffit largement)

## Connexion depuis Vercel (post cutover)

```
DATABASE_URL=postgresql://keymatch:PASS@fetcher.keymatch-immo.fr:5432/keymatch?sslmode=require
```

Mais le port 5432 du VPS est bind localhost. Pour exposer aux Vercel
serverless functions, 2 options :

**A. Caddy avec tunnel TLS** :
```caddyfile
:5432 {
  reverse_proxy tcp://localhost:5432
}
```

**B. PgBouncer + port public** (recommandé) :
```
DATABASE_URL=postgresql://keymatch:PASS@149.202.60.152:6432/keymatch?sslmode=require
```
+ ouvrir port 6432 dans UFW + auth scram-sha-256 forte.

**C. Cloudflare Tunnel TCP** : 0€/mois, masque l'IP du VPS, idéal sécu.

À décider au moment du cutover.

## Désinstaller (revert clean)

```bash
docker compose down -v   # supprime aussi le volume data
sudo rm -rf /srv/keymatch/postgres-data
rm -rf .env dumps/
```

## Coûts ajoutés

Aucun. Postgres tourne sur le VPS-2 existant (12 GB RAM disponibles, on
en utilise 2 GB max + 256 MB pour PgBouncer).
