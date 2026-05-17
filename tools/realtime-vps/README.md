# KeyMatch Realtime self-host — Phase 4 plan migration OVH

Service socket.io self-host pour remplacer Supabase Realtime.

## Pour quoi
- **Indépendance Supabase Realtime** : Phase 4 du plan `nestmatch/docs/MIGRATION_OVH_COMPLETE_PLAN.md`
- **Self-host complet** : pas de quota messages Realtime Supabase
- **Coexiste** avec Postgres VPS, MinIO, Next.js, worker Zendriver
- **Coût** : 0€ (tourne sur VPS-2, ~50 MB RAM)

## État actuel (préparation, ZÉRO risque prod)

Ce dossier contient :
- `src/server.js` : service Node socket.io + Postgres LISTEN
- `package.json` : 3 deps (socket.io, pg, jsonwebtoken)
- `Dockerfile` : image alpine ~80 MB
- `docker-compose.yml` : healthcheck + bind localhost:3001
- `Caddyfile.fragment` : reverse-proxy wss://ws.keymatch-immo.fr
- `.env.example` : DATABASE_URL + NEXTAUTH_SECRET + ALLOWED_ORIGINS

Côté KeyMatch (livré en parallèle) :
- `nestmatch/lib/realtime/index.ts` : hook React `useRealtimeSubscription()` qui dispatche Supabase ↔ socket.io
- `nestmatch/app/api/auth/realtime-token/route.ts` : émet JWT court TTL pour authentifier socket.io handshake
- `nestmatch/supabase/migrations/085_p3_4_realtime_triggers.sql` : triggers pg_notify sur 4 tables (messages, notifications, visites, annonces)

**Ce dossier ne fait RIEN tant que :**
1. Phase 2 (Postgres VPS) n'est pas active
2. Migration 085 n'est pas appliquée sur Postgres VPS
3. `docker compose up -d` n'est pas lancé
4. `NEXT_PUBLIC_REALTIME_PROVIDER=socketio` n'est pas set côté Vercel

## Migration call sites — STATUS

⚠ Les 8 call sites Supabase Realtime actuels ne sont **pas encore migrés** :
- `app/(authenticated)/mon-logement/page.tsx` (annonces)
- `app/(authenticated)/messages/page.tsx` (messages × 2 + visites + typing presence)
- `app/(authenticated)/notifications/page.tsx` (notifications)
- `app/components/Navbar.tsx` (visites + messages)
- `app/components/NotificationBell.tsx` (notifications)
- `app/components/BottomNavMobile.tsx` (notifications)
- `app/components/ToastStack.tsx` (notifications)

Migration recommandée :
```ts
// AVANT
const ch = supabase.channel(`mon-logement-${id}`)
  .on("postgres_changes", { event: "UPDATE", table: "annonces", filter: `id=eq.${id}` }, payload => ...)
  .subscribe()
return () => supabase.removeChannel(ch)

// APRÈS
import { useRealtimeSubscription } from "@/lib/realtime"
useRealtimeSubscription("annonces", { filter: { id } }, event => {
  if (event.event !== "UPDATE") return
  // ...
})
```

À faire dans un follow-up commit dédié (chaque migration ~30min, tests à ajouter).

## Procédure activation (~2-3h)

### Phase A — Pré-requis (Phase 2 active)
Postgres VPS doit tourner. Si pas encore : terminer Phase 2 d'abord.

### Phase B — Apply migration 085 sur Postgres VPS (5 min)
```bash
ssh -i $HOME\.ssh\keymatch_vps ubuntu@149.202.60.152
cd /opt/keymatch/NextImmo-main
docker exec -i keymatch-postgres psql -U keymatch keymatch \
  < nestmatch/supabase/migrations/085_p3_4_realtime_triggers.sql
# Test
docker exec keymatch-postgres psql -U keymatch keymatch -c "
  SELECT trigger_name, event_object_table
  FROM information_schema.triggers
  WHERE trigger_name LIKE 'keymatch_notify_%'
"
# Doit afficher 4 triggers
```

### Phase C — Build + run service socket.io (15 min)
```bash
cd tools/realtime-vps
cp .env.example .env
# Édite .env avec DATABASE_URL pointant vers keymatch-postgres + NEXTAUTH_SECRET
nano .env

sudo docker compose build
sudo docker compose up -d
sudo docker compose logs -f keymatch-realtime
# Attends "[realtime] postgres connected" + "listening on 4 pg channels"
# Ctrl+C
```

### Phase D — DNS + Caddy (15 min)
DNS OVH zone keymatch-immo.fr :
```
A  ws  → 149.202.60.152  (TTL 600)
```

Sur le VPS :
```bash
sudo cat tools/realtime-vps/Caddyfile.fragment >> /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy --since "-2m"
# Attends "certificate obtained successfully" pour ws.keymatch-immo.fr

# Test
curl -fsS https://ws.keymatch-immo.fr/health
# Doit retourner { ok: true, pg: true, channels: [...], sockets: 0 }
```

### Phase E — Côté Vercel (5 min)
```bash
# Sur machine de Paul
cd nestmatch
npm install socket.io-client --workspace=nestmatch
# Commit + push
```

Vercel Dashboard → Settings → Environment Variables (Production + Preview) :
| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_REALTIME_PROVIDER` | `socketio` |
| `NEXT_PUBLIC_REALTIME_URL` | `wss://ws.keymatch-immo.fr` |

Redeploy.

### Phase F — Test régression (45 min)
Tester avec 2 onglets :
- [ ] Messages chat : msg envoyé d'un côté arrive instantanément de l'autre
- [ ] Notifications : badge cloche s'incrémente quand on déclenche une notif
- [ ] Visites : changement statut visite côté proprio visible côté locataire
- [ ] mon-logement : update annonce visible

Vérifie aussi :
- [ ] `/admin/operations` → "Realtime: socketio (configured)"
- [ ] Logs container : `docker logs -f keymatch-realtime` voit les `connect` + `subscribe`
- [ ] Sécurité : user A ne reçoit pas les events user B (`shouldDeliver` server)

### Phase G — Rollback si problème
Flip `NEXT_PUBLIC_REALTIME_PROVIDER=supabase` + redeploy. Le hook revient à Supabase Realtime instantanément.

## Architecture

```
USER (browser) ──ws──> wss://ws.keymatch-immo.fr (Caddy)
                              ↓ reverse-proxy
                       keymatch-realtime:3001 (socket.io)
                              ↓ LISTEN
                       keymatch-postgres:5432
                              ↑ NOTIFY (triggers)
                       INSERT/UPDATE/DELETE sur :
                         - messages
                         - notifications
                         - visites
                         - annonces
```

## Sécurité

1. **Auth handshake JWT NextAuth** : seuls les users avec session NextAuth peuvent se connecter
2. **Filter server-side** : `shouldDeliver()` dans `src/server.js` vérifie que `row.user_email === socket.email` (ou équivalent par table) AVANT le broadcast
3. **CORS strict** : seules les origines listées dans `ALLOWED_ORIGINS` peuvent se connecter
4. **Bind localhost** : le port 3001 n'est pas exposé en externe, seul Caddy y accède

## Limites V1

- **Pas de presence/typing** : les indicateurs "user is typing" actuels utilisent Supabase Broadcast. À migrer vers socket.io rooms (5min de code, V2).
- **Pas de message replay** : si user offline 1h, il n'aura pas les events ratés au reconnect. Acceptable car KeyMatch poll la DB au mount (utilité Realtime = updates "after mount").
- **Pas de sharding** : 1 service = 1 process Node. Limite ~10k sockets simultanées (largement suffisant pour KeyMatch).
- **Pas de Redis pub/sub** : si on lance 2 réplicas Node, les events sont locaux → pas de cohérence. À ajouter pour scale-out.

## Coût après Phase 4

| Avant | Après |
|---|---|
| Supabase Realtime free tier (2 M messages/mois) | VPS 0€ |
| Quota dépassé → Pro 25€/mois | 0€ |

Économie marginale aujourd'hui (on est < 100k msg/mois), mais bloque le risque d'explosion si KeyMatch scale.

## Monitoring

```bash
# Logs Caddy
tail -f /var/log/caddy/keymatch-realtime.log

# Logs container
docker logs -f keymatch-realtime

# Stats live
curl https://ws.keymatch-immo.fr/health | jq

# Stats Postgres triggers
docker exec keymatch-postgres psql -U keymatch keymatch -c "
  SELECT schemaname, relname, n_tup_ins, n_tup_upd, n_tup_del
  FROM pg_stat_user_tables
  WHERE relname IN ('messages','notifications','visites','annonces')
"
```
