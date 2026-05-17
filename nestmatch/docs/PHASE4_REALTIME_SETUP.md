# Phase 4 — Migration Realtime Supabase → socket.io self-host

État : code **livré (V97.39.21)**, activation **~2-3h le jour J** quand Phases 2+6 actives.

## Pour quoi

Supabase Realtime = bridge WebSocket gratuit jusqu'à 2 M messages/mois, puis facturation. Self-host socket.io sur VPS OVH = 0€ + indépendance + scalable. Phase 4 du plan migration OVH.

KeyMatch utilise actuellement Realtime sur 4 tables / 8 call sites :
- `messages` (chat + invitations visites embedded)
- `notifications` (badge cloche)
- `visites` (status changements)
- `annonces` (mon-logement updates)

## Architecture livrée

```
USER (browser) ──ws──> wss://ws.keymatch-immo.fr (Caddy TLS)
                              ↓
                       keymatch-realtime:3001 (tools/realtime-vps)
                              │
                              ├─ Auth JWT NextAuth (HS256, TTL 1h)
                              ├─ Filter user_email côté server (shouldDeliver)
                              └─ pg.LISTEN sur 4 channels
                                      ↓
                              keymatch_messages
                              keymatch_notifications
                              keymatch_visites
                              keymatch_annonces
                                      ↑ pg_notify
                              triggers AFTER INSERT/UPDATE/DELETE (migration 085)
```

## Composants livrés

### Côté VPS (tools/realtime-vps/)
- `src/server.js` (266 lignes) : service Node socket.io + pg LISTEN + JWT auth + shouldDeliver filter
- `package.json` : 3 deps (socket.io, pg, jsonwebtoken)
- `Dockerfile` : alpine ~80 MB
- `docker-compose.yml` : bind localhost:3001 + healthcheck
- `Caddyfile.fragment` : reverse-proxy wss://ws.keymatch-immo.fr
- `README.md` : procédure activation 7 phases A-G

### Côté Postgres VPS
- `nestmatch/supabase/migrations/085_p3_4_realtime_triggers.sql` : 4 triggers + 1 fonction `keymatch_notify_change()`
  - Tronque les payloads >7500 bytes (limite pg_notify 8000)
  - Tronque les fields gourmands (annonces.description >200 chars, messages.contenu >500)
  - SECURITY DEFINER pour bypass RLS sur la NOTIFY

### Côté KeyMatch (nestmatch/)
- `lib/realtime/index.ts` : hook `useRealtimeSubscription(table, options, callback)` qui dispatche Supabase ↔ socket.io
  - Lazy import `socket.io-client` (pas dans bundle si Phase 4 inactive)
  - Filter client `{ field: value }` après réception
  - Reconnect auto
- `app/api/auth/realtime-token/route.ts` : émet JWT HS256 court TTL pour authentifier socket.io handshake (réutilise NEXTAUTH_SECRET, pas de dep externe)
- `__tests__/integration/realtime-dispatcher.test.ts` : 4 tests vert (provider routing)

## Migration des 8 call sites — STATUS

⚠ **Les 8 fichiers qui utilisent `supabase.channel(...)` ne sont PAS encore migrés** vers `useRealtimeSubscription`. C'est un follow-up commit dédié (V97.39.22+).

Pourquoi pas dans cette V : 8 call sites × refactor + tests = ~4h. Le dispatcher est en place, on peut migrer progressivement comme on a fait pour Brevo (email) et MinIO (storage).

Pour migrer un call site :
```ts
// AVANT
useEffect(() => {
  if (!email) return
  const ch = supabase
    .channel(`notifs-${email}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_email=eq.${email}` }, refresh)
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}, [email])

// APRÈS
import { useRealtimeSubscription } from "@/lib/realtime"
useRealtimeSubscription(
  "notifications",
  { filter: { user_email: email }, enabled: !!email },
  () => refresh(),
)
```

## Activation en prod (~2-3h, dépend Phases 2+6)

Procédure complète : `tools/realtime-vps/README.md` phases A-G.

Résumé :
1. Phase 2 (Postgres VPS) active — sinon pas de triggers
2. Apply `085_p3_4_realtime_triggers.sql` sur Postgres VPS
3. `cd tools/realtime-vps && cp .env.example .env && nano .env` (DATABASE_URL + NEXTAUTH_SECRET)
4. `sudo docker compose up -d`
5. DNS OVH : A record `ws.keymatch-immo.fr` → IP VPS
6. Caddy : append `tools/realtime-vps/Caddyfile.fragment` au global Caddyfile + reload
7. `npm install socket.io-client` côté Next.js + commit/push
8. Vercel env : `NEXT_PUBLIC_REALTIME_PROVIDER=socketio` + `NEXT_PUBLIC_REALTIME_URL=wss://ws.keymatch-immo.fr` + redeploy
9. Test 2 onglets : chat + notifications + visites + mon-logement
10. Migrer les 8 call sites progressivement (1 commit par fichier)

Rollback à n'importe quelle étape : flip `NEXT_PUBLIC_REALTIME_PROVIDER=supabase` + redeploy.

## Sécurité

| Couche | Mécanisme |
|---|---|
| Transport | TLS Let's Encrypt via Caddy |
| Auth | JWT NextAuth HS256 (handshake socket.io) |
| Origin | CORS strict ALLOWED_ORIGINS |
| Row-level | `shouldDeliver(user, channel, payload)` filtre par email server-side |
| Bind | Container expose 127.0.0.1:3001, Caddy seul accède |

## Limites V1

- **Pas de presence/typing** : Supabase Broadcast `typing:${conv}` (messages page line 2362) pas couvert. À migrer vers socket.io rooms `typing:${conv}` dans une V2 (5min code).
- **Pas de message replay** : si offline 1h, reconnect ne récupère pas les events ratés. Acceptable (le hook recharge la DB au mount).
- **Pas de sharding** : single Node process. Limite ~10k sockets simultanées (KeyMatch ~50 actifs).
- **Pas de Redis pub/sub** : 1 réplique. Pour scale-out multi-instance, ajouter Redis adapter (`@socket.io/redis-adapter`).

## Coût après Phase 4

| Avant | Après |
|---|---|
| Supabase Realtime (free 2M msg/mois) | VPS 0€ |
| Risque upgrade Pro 25€/mois | 0€ |

Économie marginale aujourd'hui, mais bloque le risque d'explosion si scale.

## Tests vitest

`__tests__/integration/realtime-dispatcher.test.ts` : 4 tests (provider default, flip socketio sans URL, flip socketio avec URL, fallback unknown).
