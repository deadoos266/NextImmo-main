# Phase 6 cutover SUCCESS — 2026-05-18 12:21 UTC

## TL;DR
KeyMatch tourne maintenant sur VPS OVH (149.202.60.152), plus sur Vercel.
DNS keymatch-immo.fr + www.keymatch-immo.fr pointent vers le VPS.
Caddy serve TLS auto Let's Encrypt → reverse proxy → container Next.js Docker.

## Architecture finale prod
```
Internet → keymatch-immo.fr (DNS A → 149.202.60.152)
            ↓
       Caddy 443 (TLS R13 Let's Encrypt, valide 2026-07-19)
            ↓
       localhost:3030 (container keymatch-next)
            ↓
            ├─ Supabase API (data/auth, 88-94ms latency)
            ├─ MinIO via media.keymatch-immo.fr (storage)
            └─ Brevo API (email transactionnel)
```

## Latency mesurée (depuis machine externe avec --resolve override)
- /api/health        196ms
- /                  126ms
- /annonces          153ms
- /login             120ms (307 redirect)
- /sitemap.xml        63ms

## Root cause du bug initial Phase 6 (résolu V97.39.31)
NEXT_PUBLIC_SUPABASE_URL était baked au build avec dummy
`https://build-time-dummy.supabase.co` car Next.js inline les NEXT_PUBLIC_*
vars au build time, pas runtime. Le SDK Supabase essayait de fetch cette URL
au runtime → DNS NXDOMAIN/timeout → "fetch failed" 7s.

Fix : Dockerfile ARG + docker-compose build args pour passer les vraies
NEXT_PUBLIC_* au build. Les server-only vars (SERVICE_ROLE_KEY, NEXTAUTH_SECRET)
restent runtime via env_file.

## Vercel toujours actif (pour rollback)
Le projet next-immo-main reste sur Vercel pour rollback rapide pendant 30 jours.
DNS A apex 76.76.21.21 (Vercel IP) à remettre en cas de bug critique :
  - OVH zone DNS → @ A → 76.76.21.21 (TTL 60s, retour Vercel 1-5min)
  - Idem www A

## À faire J+7 (si tout OK)
Downgrade Vercel Pro → Hobby (gratuit) tout en gardant le projet.
**Économie : 18€/mois → 0€**.

## À faire J+30 (si tout OK)
Supprimer projet Vercel → vraiment plus de Vercel.

## Containers VPS actifs (6 sur 1 VPS)
1. keymatch-next      (Phase 6 — Next.js prod)
2. keymatch-postgres  (Phase 2 shadow, sync horaire)
3. keymatch-pgbouncer (Phase 2)
4. keymatch-minio     (Phase 3 — storage prod)
5. keymatch-realtime  (Phase 4 — socket.io ready)
6. keymatch-fetcher   (Phase 1 — DataDome bypass)
