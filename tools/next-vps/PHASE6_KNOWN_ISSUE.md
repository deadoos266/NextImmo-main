# Phase 6 Cutover — Known Issue 2026-05-17/18

## Symptôme
Le container Next.js prod boot OK (276-320ms) mais TOUS les fetches Supabase
via `@supabase/supabase-js` SDK timeout en 7s, retournent "TypeError: fetch failed".

## Investigation
### Ce qui MARCHE depuis le container
- `wget https://wzzibgdupycysvtwsqxo.supabase.co/rest/v1/` : ✓ 401 en <1s
- `node -e "fetch(URL)"` direct : ✓ 401 en <1s
- `fetch(URL, { headers: <supabase-like> })` : ✓ 206 en 220ms
- Pages publiques sans DB (/, /aide, /cgu, /sitemap.xml) : ✓ <70ms

### Ce qui TIMEOUT depuis le container
- `supabaseAdmin.from("annonces").select(...)` (SDK Supabase JS) : ✗ 7s
- `/api/health` (utilise le SDK) : ✗ degraded systématique
- `/annonces/<id>` (SSR + SDK) : ✗ HTTP 404 après 7.3s

## Tests effectués (toutes infructueuses)
1. `node:22-alpine` → `node:22-slim` (Debian) : même bug
2. Sentry désactivé (SENTRY_DSN= , NEXT_PUBLIC_SENTRY_DSN=) : même bug
3. `NODE_OPTIONS=--dns-result-order=ipv4first` : même bug
4. Network bridge default vs keymatch-postgres-net : même bug
5. Build avec env vars dummy puis runtime real : même bug

## Hypothèses restantes (à creuser demain)
1. **Supabase SDK `realtime` subscription** au boot fait un wss:// fail
2. **TLS keepalive** : Node 22 native fetch vs OpenSSL Debian stack
3. **Module bundle** : webpack bundle inline le SDK mais pas une dep système
4. **PostgREST wrapper** dans `@supabase/postgrest-js` qui fait un préflight CORS
5. **Bug spécifique** `@supabase/supabase-js` ^2.49.4 sur Node 22 outside Vercel

## Status cutover
**ANNULÉ 2026-05-18 11:58 UTC** (2e tentative).
Container stoppé, bloc Caddy retiré V97.39.30 (1ère tentative).
Vercel reste source unique pour keymatch-immo.fr.

## Workaround possible (à tester demain)
Remplacer `supabaseAdmin.from(...)` par des fetch directs au PostgREST endpoint :
```ts
// Avant
const { data, error } = await supabaseAdmin.from("annonces").select("...")

// Après
const r = await fetch(`${SUPABASE_URL}/rest/v1/annonces?select=...`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
})
```
Mais c'est 100+ call sites — gros refactor.

## Workaround alternatif (rapide)
Migrer Phase 2 (Postgres VPS source of truth) AVANT Phase 6. Le code Next.js
parlerait au Postgres VPS local via `pg` driver (pas via SDK Supabase qui timeout).
Mais Phase 2 cutover DB = 2-3h sprint dimanche.

## Recommandation : reporter Phase 6 à après Phase 2

L'investigation SDK Supabase peut consommer 5-10h supplémentaires sans
garantie. Plus pragmatique de basculer Phase 2 (DB VPS) qui élimine le besoin
de SDK Supabase fetch côté Next.js — on parle direct à Postgres local.
