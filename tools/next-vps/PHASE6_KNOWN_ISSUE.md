# Phase 6 Cutover — Known Issue 2026-05-17

## Symptôme
Tentative de cutover Phase 6 (V97.39.30) : container Next.js prod boot OK
(320ms) mais les pages qui fetchent Supabase via le SDK retournent 404
après 7.3s timeout.

## Tests live (VPS, container actif)
- `wget https://wzzibgdupycysvtwsqxo.supabase.co/rest/v1/` : ✓ 401 en <1s
- `node -e "fetch(...)"` direct dans container : ✓ 401 en <1s
- `/api/health` (utilise Supabase JS client) : ✗ timeout 7s "fetch failed"
- `/annonces/<id>` (SSR + Supabase JS client) : ✗ HTTP 404 après 7.3s

## Hypothèse root cause
`node:22-alpine` a un bug TLS keepalive avec certaines stacks fetch. Le
SDK Supabase JS construit ses connexions HTTPS d'une manière incompatible
avec Alpine musl libc + Node 22 native fetch.

## Fix probable
Migrer `tools/next-vps/Dockerfile` :
  FROM node:22-alpine → FROM node:22-slim (Debian)
Tests à refaire après rebuild.

## Status cutover
ANNULÉ 2026-05-17 21:50 UTC. Container stoppé, bloc Caddy retiré.
Vercel reste source unique pour keymatch-immo.fr. À reprendre fresh demain.

## Liste actions rollback effectuées
1. `docker stop keymatch-next` ✓
2. `docker rm keymatch-next` ✓
3. `sed -i '/V97.39.30 — Phase 6/,/^}$/d' /etc/caddy/Caddyfile` ✓
4. `systemctl reload caddy` ✓
5. Vérifié ws/media/fetcher toujours UP ✓
6. DNS apex non touché (toujours pointe Vercel) ✓

## Impact prod : NUL (rollback propre)
