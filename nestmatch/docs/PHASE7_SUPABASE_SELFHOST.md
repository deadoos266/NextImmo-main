# Phase 7 — Migration Supabase Cloud → VPS self-host

**Statut** : Infra prête, en attente DNS A record `db.keymatch-immo.fr`.

**Objectif** : Indépendance totale Supabase Cloud. La DB, l'API REST et le
Realtime tournent sur le VPS OVH (149.202.60.152).

## Pourquoi

Avant Phase 7 : `@supabase/supabase-js` tape `https://wzzibgdupycysvtwsqxo.supabase.co`
→ Supabase Cloud (Free 500 MB DB, 2 GB egress/mois, risque limites + dépendance).

Après Phase 7 : `@supabase/supabase-js` tape `https://db.keymatch-immo.fr`
→ Caddy → PostgREST (REST) + supabase/realtime self-host (WebSocket). Zéro
changement code, le SDK ne voit pas la différence.

## Stack déployée

| Service | Image | Port host | Hostname Docker |
|---|---|---|---|
| keymatch-postgres | postgres:17-alpine | 127.0.0.1:5432 | keymatch-postgres |
| keymatch-pgbouncer | edoburu/pgbouncer | 127.0.0.1:6432 | keymatch-pgbouncer |
| keymatch-postgrest | postgrest/postgrest:v12.2.3 | 127.0.0.1:3000 | keymatch-postgrest |
| keymatch-supabase-realtime | supabase/realtime:v2.34.43 | 127.0.0.1:4000 | keymatch-supabase-realtime |
| Caddy (host) | systemd | 443/80 | — |

Tous sur le même réseau Docker `keymatch-postgres-net`.

## Changements Postgres

- `wal_level=logical` (requis pour supabase/realtime logical decoding)
- `max_replication_slots=10` + `max_wal_senders=10`
- Rôles ajoutés :
  - `authenticator` (LOGIN, NOINHERIT) — PostgREST connect avec, switch role via JWT
  - `anon` (NOLOGIN, NOINHERIT) — role par défaut sans JWT
  - `authenticated` (NOLOGIN, NOINHERIT) — role pour JWT user
  - `service_role` (NOLOGIN, NOINHERIT, BYPASSRLS) — role pour service_role JWT
  - `supabase_realtime_admin` (LOGIN, REPLICATION) — connect realtime container
- Schéma `_realtime` créé (utilisé par realtime container pour stocker tenants)
- Publication SQL `supabase_realtime` sur 10 tables KeyMatch :
  messages, notifications, visites, annonces, bail_signatures,
  edl_signatures, contacts, signalements, etats_des_lieux, loyers
- REPLICA IDENTITY FULL sur ces 10 tables (pour broadcast des old values)

## JWT compat Supabase

Le SDK `@supabase/supabase-js` envoie `apikey: <JWT>` header. PostgREST lit
`Authorization: Bearer <JWT>`. Caddy rewrite `apikey` → `Authorization` si
absent. Les JWTs sont signés HS256 avec `POSTGREST_JWT_SECRET` (généré
aléatoirement à l'init).

2 JWTs générés (10 ans d'expiration) :
- `ANON_KEY` : `{ "role": "anon", "iss": "keymatch-postgrest", ... }`
- `SERVICE_ROLE_KEY` : `{ "role": "service_role", ... }`

Ces 2 JWTs remplacent `NEXT_PUBLIC_SUPABASE_ANON_KEY` et
`SUPABASE_SERVICE_ROLE_KEY` dans `/etc/keymatch-prod.env`. Aucun changement
code Next.js requis.

## Realtime tenant config

L'image `supabase/realtime` est multi-tenant. Au seed initial, elle crée
un tenant `realtime-dev`. On le renomme en `db` pour matcher le subdomain
`db.keymatch-immo.fr` (le routing par hôte est intrinsèque à l'image).

Le `jwt_secret` stocké en DB est chiffré AES-128 GCM avec `REALTIME_ENC_KEY`.
Le script `tools/supabase-realtime-vps/scripts/setup-tenant.sh` automatise :

1. Rename tenant
2. `Realtime.Crypto.encrypt!(POSTGREST_JWT_SECRET)` via `docker exec eval`
3. `UPDATE _realtime.tenants SET jwt_secret = <encrypted_b64>`

## Caddy routing

```
db.keymatch-immo.fr
├── /rest/v1/*       → strip prefix → localhost:3000 (PostgREST)
├── /realtime/v1/*   → rewrite to /socket/websocket → localhost:4000 (Realtime)
├── /health          → 200 OK (sanity check)
└── *                → 404
```

Header rewrite `apikey: <JWT>` → `Authorization: Bearer <JWT>` si absent.

## Cutover procédure (Phase 7e)

```bash
ssh ubuntu@149.202.60.152
cd /opt/keymatch/NextImmo-main/tools/postgrest-vps
sudo bash scripts/cutover.sh
```

Le script :
1. Backup `/etc/keymatch-prod.env` → `/etc/keymatch-prod.env.bak.cutover-YYYY-...`
2. Regénère ANON_KEY + SERVICE_ROLE_KEY depuis POSTGREST_JWT_SECRET
3. Flip `NEXT_PUBLIC_SUPABASE_URL` + ANON_KEY + SERVICE_ROLE_KEY
4. `docker compose up -d --build keymatch-next` (rebuild car NEXT_PUBLIC_* baked)
5. Wait 40s puis curl /api/health → 200

## Rollback

```bash
sudo cp /etc/keymatch-prod.env.bak.cutover-XXX /etc/keymatch-prod.env
cd /opt/keymatch/NextImmo-main/tools/next-vps
sudo docker compose up -d --build keymatch-next
```

~2 min total. Aucune data perdue côté Supabase Cloud (la DB là-bas n'est
pas touchée du tout).

## Smoke test post-cutover

1. `curl https://keymatch-immo.fr/api/health` → 200
2. `curl -H "apikey: $ANON_KEY" https://db.keymatch-immo.fr/rest/v1/annonces?select=count` → 200
3. Browser : `/proprietaire/mes-biens` doit s'afficher (test PostgREST + RLS)
4. Browser : `/messages` doit afficher la liste (test PostgREST)
5. Browser : envoyer un message → l'autre tab voit l'update temps réel (test Realtime WS)
6. Vérifier `/admin/operations` : storage=minio, realtime=db.keymatch-immo.fr (auto)

## Tables non-realtime restantes

Tables sans realtime (CRUD seulement, pas d'écoute live) :
- profils, favoris, recherches_sauvegardees, cron_logs, email_logs,
  bail_avenants, bail_invitations, carnet_entretien, clics_annonces,
  conversation_preferences, dossier_access_log, dossier_share_tokens,
  email_suppress_list, health_pings, historique_baux, import_jobs,
  import_logs, incidents, irl_history, messages_emails_log, qa_runs,
  quittances_perso, release_validations, reviews, user_bug_reports, users

Pas d'action requise pour celles-ci.

## Coût mensuel après Phase 7

| Service | Avant | Après |
|---|---|---|
| Supabase Pro | 0€ (Free) | 0€ (will delete) |
| Vercel Pro | 18€ | 0€ (cancelled) |
| Resend | 0€ | 0€ (cancelled) |
| OVH VPS | 13€ | 13€ |
| OVH domaine | ~1€ | ~1€ |
| **Total** | **~32€** | **~14€** |

Économie : ~18€/mois = **216€/an**.

## Ce qui reste sur Supabase Cloud (à supprimer après 14j stables)

- Project `wzzibgdupycysvtwsqxo` (vide après cutover, 0 traffic)
- Backups Supabase (incrémental Free, perdus après delete project)
- Account `tic3467@gmail.com` (peut rester, gratuit, 0 projects)

**Action delete** (J+14) : Supabase Dashboard → Settings → Delete Project
→ taper le nom → confirmer.
