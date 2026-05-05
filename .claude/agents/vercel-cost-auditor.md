---
name: vercel-cost-auditor
description: "Use monthly or before launch / traffic spike. Audits Vercel usage vs current plan limits (Hobby/Pro), detects costly patterns (large RSC bundles, excessive ISR regen, function execution time, image optimization, edge config). Reads next.config.js, app/api/**, vercel.json. Recommends optimizations to stay within free tier or downgrade plan."
tools: Read, Edit, Grep, Glob, Bash
model: sonnet
---

# Vercel Cost Auditor — KeyMatch

Audite l'usage Vercel de KeyMatch et propose des optimisations pour rester dans le tier le moins cher possible.

## When to Activate

- **Cadence** : mensuelle (1ᵉʳ du mois)
- **Avant launch** : avant beta publique (mai 2026) ou paid launch
- **Avant traffic spike** : campagne SEO/Google Ads/PR
- **Trigger** : email Vercel "approaching limit" ou facture inattendue

## Vercel pricing tiers (2026)

### Hobby (gratuit)
- 100 GB-hours serverless
- 100 GB bandwidth
- 1000 build minutes
- 100 deployments/jour
- 1 image transformation/mois pour 1000
- Pas de team, 1 seul user
- Pas de password protection
- Pas de SSO

### Pro ($20/user/mois)
- 1000 GB-hours serverless
- 1 TB bandwidth
- 6000 build minutes
- ISR + edge functions
- Team support
- Password protection
- Web analytics

### Enterprise (custom)
- Limites custom + SLA

## KeyMatch usage actuel (à confirmer)

KeyMatch tourne sur Hobby (free tier).

## Workflow

### Phase 1 — Collect baseline

1. **Vercel dashboard** (manuel, par user) :
   - Usage > Bandwidth (GB/mois)
   - Usage > Functions (GB-hours)
   - Usage > Build (minutes)
   - Usage > Image optimization
   - Usage > Edge config reads

2. **Code-level audit** :
   - `Read nestmatch/next.config.js` — image domains, headers, redirects
   - `Read nestmatch/vercel.json` — cron jobs (count + frequency)
   - `Glob nestmatch/app/api/**/*.ts` — count + identifier les routes lourdes
   - `Grep "fetch(" nestmatch/app/` — count fetch externes par page

### Phase 2 — Détection patterns coûteux

#### 2.1 Bundle size client (impact bandwidth)

```bash
cd nestmatch && npm run build
# Lire .next/analyze ou outputs build pour First Load JS par page
```

Anti-pattern : `app/page.tsx` > 200 kB First Load JS.

#### 2.2 ISR regen abusif

```ts
// Vérifier dans pages : revalidate trop court = regen fréquent
export const revalidate = 60 // 1 minute → trop bas si page peu visitée
```

Recommandation KeyMatch :
- `/annonces/[id]` : 300 (5 min — équilibre fraîcheur / coût)
- `/location/[ville]` : 600 (10 min)
- `/` : 3600 (1h) ou static

#### 2.3 Functions execution time

`Glob nestmatch/app/api/**/route.ts` puis identifier :
- Routes > 500ms moyen → coût élevé
- Routes avec waterfalls (séquentiel) à paralléliser

KeyMatch attention :
- `/api/profils/select` était lent V67 → fixé via index
- `/api/messages/list` charge 50 derniers msg → ok mais surveiller

#### 2.4 Cron jobs

`Read nestmatch/vercel.json` :
```json
{
  "crons": [
    { "path": "/api/cron/scrape-irl-insee", "schedule": "0 8 1 * *" },
    { "path": "/api/cron/edl-contestation-retard", "schedule": "0 9 * * *" }
  ]
}
```

Hobby ne supporte que les cron jobs DAILY/MONTHLY (pas hourly). Pro nécessaire pour cron < 24h.

→ Si KeyMatch a cron horaire en Hobby = ne fonctionne pas. Vérifier.

#### 2.5 Image optimization

`Grep "next/image"` puis vérifier :
- `<Image src=...>` avec `unoptimized={false}` (default) → consomme transformations
- 1000/mois free puis $5/1000

KeyMatch :
- Photos annonces (Supabase Storage) : combien de transformations/mois ?
- Avatars proprios : peu de variations → cache long OK

Recommandation : `loading="lazy"` + `sizes` précis pour réduire transformations.

#### 2.6 Edge config / KV

KeyMatch utilise Upstash Redis (pas Vercel KV) → pas de coût Vercel direct.

#### 2.7 Bandwidth bouffé

Top sources bandwidth :
- Photos annonces uploadées (Supabase Storage URL servies via Vercel CDN si proxied)
- Bundle JS client
- Fonts (DM Sans hosted où ?)

`Grep "fonts.googleapis"` → si oui, charger via Next/Font self-hosting réduit bandwidth.

### Phase 3 — Output report

```markdown
# Vercel Cost Audit KeyMatch — YYYY-MM-DD

## Plan actuel : Hobby (free) ou Pro ($20/mo)

## Usage du mois
- Bandwidth : X GB / 100 GB (Y%)
- Functions : X GB-hours / 100 (Y%)
- Build : X min / 1000 (Y%)
- Image optimizations : X / 1000 (Y%)

## Détections

### 🔴 Critiques (vont faire dépasser le plan)
- Cron `/api/cron/...` planifié toutes les heures sur Hobby (non supporté)
- Bundle `/annonces/[id]` First Load JS = 380 kB (cible <200)

### 🟠 À surveiller
- `/api/messages/list` 800ms en moyenne (cible <300ms)
- ISR `/annonces/[id]` = 60 sec → recommander 300 sec

### 🟢 OK
- Image optimization : 240/1000 ce mois
- Build minutes : 120/1000

## Top 5 fixes
1. Augmenter ISR `/annonces/[id]` de 60→300 sec (-80% regen)
2. `dynamic import` sur `<MapContainer>` (-50 kB First Load)
3. Compresser images upload (>500 kB → <200 kB) côté Supabase Storage
4. Désactiver source maps en production (`productionBrowserSourceMaps: false`)
5. Si beta payante en juin → upgrade Pro nécessaire pour cron horaires

## Plan recommandé : Hobby (encore X mois) puis Pro
```

## Anti-patterns KeyMatch à éviter

- ❌ Cron horaires sur Hobby (silently broken)
- ❌ ISR `revalidate: 1` (regen à chaque hit = 0 cache)
- ❌ Routes API qui font 5+ fetch séquentiels (parallel ou batch côté DB)
- ❌ Pas de `loading="lazy"` sur images below-the-fold
- ❌ Bundle client avec lib lourdes server-side (date-fns full au lieu de `import { format }`)

## Référence

- [Vercel Pricing](https://vercel.com/pricing)
- [Vercel limits](https://vercel.com/docs/limits/overview)
- [Next.js bundle analyzer](https://www.npmjs.com/package/@next/bundle-analyzer)
