# PostgREST self-host — Phase 7 migration Supabase → VPS

Remplace l'API REST Supabase (`https://wzzibgdupycysvtwsqxo.supabase.co/rest/v1/*`)
par PostgREST self-host sur ton VPS OVH, branché sur `keymatch-postgres`.

## Pourquoi

- **Indépendance totale Supabase Cloud** (V97.39.32+)
- **Zéro changement code** : `@supabase/supabase-js` continue de marcher,
  on flip juste `NEXT_PUBLIC_SUPABASE_URL` vers `https://db.keymatch-immo.fr`.
- PostgREST = exactement le même soft que Supabase utilise en interne pour
  exposer Postgres en API REST + RLS + JWT.

## Pré-requis

- `keymatch-postgres` container UP sur le VPS (Phase 2 déjà faite)
- Caddy installé sur le VPS (Phase 0)
- DNS `db.keymatch-immo.fr` qui pointe sur le VPS (à créer dans OVH zone)

## Architecture cible

```
Browser → https://db.keymatch-immo.fr/rest/v1/annonces?select=*
        │ (Authorization: Bearer <jwt>)
        ▼
   Caddy (TLS Let's Encrypt)
        │
        │ → /rest/v1/* → PostgREST (port 3000)
        │ → /realtime/v1/* → supabase/realtime self-host (port 4000)
        ▼
   keymatch-postgres (Docker network keymatch-net)
```

## Setup (idempotent, ~30 min)

### 1. Créer les rôles Postgres requis

```bash
ssh ubuntu@149.202.60.152
cd /opt/keymatch/NextImmo-main/tools/postgrest-vps
sudo docker exec -i keymatch-postgres psql -U keymatch -d keymatch < scripts/init-roles.sql
```

Crée les rôles `anon`, `authenticated`, `service_role` (compat Supabase).

### 2. Générer JWT_SECRET + anon/service keys

```bash
sudo cp .env.example .env
sudo openssl rand -base64 48 | tr -d '\n' > /tmp/jwt-secret
sudo cat /tmp/jwt-secret # noter pour étape 3
# Édite .env : POSTGREST_JWT_SECRET=<ce qui est dans /tmp/jwt-secret>
sudo nano .env

# Génère les 2 JWTs avec le même secret
sudo bash scripts/generate-keys.sh
# → affiche ANON_KEY + SERVICE_ROLE_KEY à copier dans /etc/keymatch-prod.env
```

### 3. Démarrer PostgREST

```bash
sudo docker compose up -d
sudo docker compose logs -f
# Attends "PostgREST X.X running"
```

### 4. Test local (sans Caddy)

```bash
# Récupère ANON_KEY de .env
ANON_KEY=$(grep ANON_KEY .env | cut -d= -f2)
curl -H "apikey: $ANON_KEY" http://localhost:3000/annonces?select=count
# Attendu : un nombre, pas d'erreur
```

### 5. Brancher Caddy

Cf `Caddyfile.fragment` à ajouter dans la config Caddy globale du VPS.

## Rollback

```bash
# Flip env var sur le container Next.js → revient sur Supabase Cloud
sudo sed -i 's|NEXT_PUBLIC_SUPABASE_URL=https://db.keymatch-immo.fr|NEXT_PUBLIC_SUPABASE_URL=https://wzzibgdupycysvtwsqxo.supabase.co|' /etc/keymatch-prod.env
sudo docker restart keymatch-next
```

## Notes RLS

Supabase prod n'a que 5 RLS policies (audit 2026-05-17). Elles sont
gérées par les migrations applicatives (`nestmatch/supabase/migrations/`).
La sécurité KeyMatch repose à 95% sur les routes API serverless qui
valident côté Next.js (NextAuth + checks manuels), pas sur RLS DB.

Le rôle `service_role` créé par `scripts/init-roles.sql` a `BYPASSRLS`
donc les routes API server (NextAuth) ne sont jamais impactées par les
RLS. Le rôle `anon` (JWT sans authentification) ne devrait avoir accès
qu'aux tables publiques (`annonces` en lecture seule pour la liste des
biens). Vérifier que `anon` n'a pas trop de droits via `\du+` Postgres
si tu veux durcir.

## JWT compatibility

PostgREST valide les JWTs avec `POSTGREST_JWT_SECRET`. Supabase utilise
HS256 par défaut. On régénère 2 JWTs :

- `ANON_KEY` : `{ "role": "anon", "iat": <now>, "exp": <now+10y> }`
- `SERVICE_ROLE_KEY` : `{ "role": "service_role", "iat": <now>, "exp": <now+10y> }`

Côté code, `@supabase/supabase-js` envoie l'apikey en header `apikey` et
PostgREST le lit comme JWT si match. Aucun changement code requis.
