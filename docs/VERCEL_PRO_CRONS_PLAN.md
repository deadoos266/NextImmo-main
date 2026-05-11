# Plan crons Vercel Pro post-upgrade

> Liste des crons à activer dans `vercel.json` après passage en plan Pro.
> En Hobby la limite est 2 crons daily-only.

## Actuels (Hobby, déjà actifs)

Vérifier dans `vercel.json` les 2 actuels.

## À ajouter post-Pro

### V83.6 — `/api/cron/qa-daily-run`
- Schedule : `0 4 * * *` (4h du matin daily)
- Auth : `Bearer ${CRON_SECRET}`
- Effet : déclenche les scénarios YAML, crée des rows `qa_runs` status='running' que le runner externe doit ensuite exécuter.
- Critère succès cron : HTTP 200 + JSON `{ ok: true, runs_created: N }`
- Failure alert : si 5+ fails consécutifs sur 24h, INSERT incident `app/warning`.

### À évaluer
- `/api/cron/health-check` : actuellement daily, idéal hourly (`0 * * * *`) en Pro.
- `/api/cron/depot-retard` : daily déjà OK.
- `/api/cron/loyers-retard` : daily déjà OK.
- `/api/cron/messages-digest` : daily déjà OK.
- `/api/cron/candidatures-digest` : daily déjà OK.
- `/api/cron/visites-rappel` : daily, idéal 2x/jour (`0 9,18 * * *`).
- `/api/cron/preavis-jalons` : daily OK.
- `/api/cron/edl-contestation-retard` : daily OK.
- `/api/cron/annonces-stagnantes` : weekly suffit (`0 6 * * 1`).
- `/api/cron/post-bail` : daily OK.
- `/api/cron/db-backup` : daily (3h matin recommandé `0 3 * * *`).
- `/api/cron/scrape-irl-insee` : monthly (1er jour `0 5 1 * *`).
- `/api/cron/check-irl` : hebdo OK.
- `/api/cron/irl-rappel-bail` : daily OK.
- `/api/cron/verify-integrity-baux` : weekly OK.

## Pattern d'ajout dans `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/qa-daily-run", "schedule": "0 4 * * *" },
    { "path": "/api/cron/health-check", "schedule": "0 * * * *" }
  ]
}
```

## Estimation Vercel Pro

- Pro $20/mois inclut illimité (effectivement ~unlimited dans usage raisonnable).
- 13+ crons quotidiens estimés. Si chacun fait <1s exécution, c'est ~5000ms/jour = négligeable côté limites.
- Auth `Bearer ${CRON_SECRET}` obligatoire en prod sur chaque cron.

## Runner externe pour QA Bot

V83 MVP : le cron `qa-daily-run` ne lance PAS Playwright (incompatible serverless Vercel 150MB chromium). Il crée juste les rows `qa_runs` status='running'.

Solution pour exécuter réellement Playwright :

### Option A — GitHub Actions (recommandé V83)
- Workflow `.github/workflows/qa-daily.yml` schedule `cron: '0 5 * * *'` (1h après Vercel)
- Job ubuntu-latest + node + playwright
- Poll `/api/qa/runs?status=running` (avec Bearer CRON_SECRET)
- Pour chaque run : exécute le scénario via `lib/qa/runner.ts` CLI
- PATCH `/api/qa/runs/[id]` avec le résultat
- Upload screenshots vers Supabase Storage `qa-screenshots`

### Option B — Vercel + @sparticuz/chromium
- Remplace `chromium` Playwright par `@sparticuz/chromium-min` (~50MB)
- Wrap dans `playwright-core` au lieu de `@playwright/test`
- Cold start ~5s, exécution OK dans Vercel function limit 60s (Pro)
- Pas de upload Storage à faire séparément, tout dans la même lambda

### Option C — Service externe payant
- Browserless.io / BrowserStack (~$50/mois)
- Plus rapide à intégrer, pas de maintenance infrastructure

→ V83 chosen path : **Option A (GitHub Actions)** car gratuit, simple, et fait déjà partie du stack DevOps actuel.
