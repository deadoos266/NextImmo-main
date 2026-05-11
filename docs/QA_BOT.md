# KeyMatch QA Bot

> Tests autonomes du site keymatch-immo.fr via Playwright headless,
> déclenchés par cron daily ou bouton admin, résultats en DB,
> consultables dans `/admin/qa`.

## Architecture

```
┌─────────────────┐       ┌──────────────────┐       ┌────────────────┐
│ qa/scenarios/   │       │ /api/cron/       │       │ runner externe │
│ *.yaml          │──────▶│ qa-daily-run     │──────▶│ (GitHub Action │
│ (déclaratif)    │       │ (cron Vercel)    │       │  ou local)     │
└─────────────────┘       └──────────────────┘       └────────────────┘
                                  │                            │
                                  │ INSERT row                 │ exec Playwright
                                  │ status='running'           │ PATCH résultat
                                  ▼                            ▼
                          ┌────────────────────────────────────────┐
                          │  qa_runs (Supabase Postgres)           │
                          │  + qa-screenshots (Supabase Storage)   │
                          └────────────────────┬───────────────────┘
                                               │
                                               ▼
                                  ┌─────────────────────┐
                                  │ /admin/qa (Next.js) │
                                  │ stats + table + UI  │
                                  └─────────────────────┘
```

**Pourquoi pas tout dans Vercel** : Playwright chromium = binaire 150MB,
incompatible serverless lambda Vercel (50MB max). 3 solutions :
1. **GitHub Action** (V83 MVP — gratuit, simple)
2. `@sparticuz/chromium-min` lambda-friendly (V84 si besoin de simplifier infra)
3. Service externe Browserless.io / BrowserStack (payant)

## Format scénario YAML

Chaque fichier dans `nestmatch/qa/scenarios/` :

```yaml
name: "Description courte du scénario"
role: anonymous   # ou locataire / proprietaire / admin
priority: P0      # P0 (critique launch) / P1 (important) / P2 (nice-to-have)
steps:
  - <step_type>: <value ou objet>
  - ...
```

### Steps supportés (V83.2)

| Step | Format | Exemple |
|---|---|---|
| `goto` | `path` (relatif) | `- goto: /annonces` |
| `click` | `selector CSS` | `- click: "button[data-testid=submit]"` |
| `fill` | `{ selector, value }` | `- fill: { selector: "input[name=q]", value: "Paris" }` |
| `type` | idem fill mais char par char | `- type: { selector: ..., value: ... }` |
| `expect_url` | `path` exact | `- expect_url: /annonces` |
| `expect_url_pattern` | regex | `- expect_url_pattern: "^/annonces/\\d+$"` |
| `expect_visible` | `selector` | `- expect_visible: h1` |
| `expect_text` | `{ selector, value }` text contient | `- expect_text: { selector: h1, value: "Logements" }` |
| `expect_count` | `{ selector, min?, max?, exact? }` | `- expect_count: { selector: ".card", min: 1 }` |
| `expect_meta` | `{ name? property? content_pattern }` | `- expect_meta: { property: "og:image", content_pattern: "og-default" }` |
| `screenshot` | `name` (sans extension) | `- screenshot: home-loaded` |
| `wait` | `ms` | `- wait: 1000` |
| `wait_for` | `selector` (visible) | `- wait_for: "[data-testid=results]"` |
| `request` | `"METHOD /path"` | `- request: "GET /og-default.png"` |
| `expect_status` | int | `- expect_status: 200` |
| `expect_content_type` | string | `- expect_content_type: "image/png"` |
| `login_as` | `email` (V83.5+ uniquement) | `- login_as: test-locataire@keymatch.test` |

### Exemple complet — `01-locataire-recherche-paris.yaml`

```yaml
name: "Locataire recherche un appart à Paris"
role: anonymous
priority: P0
steps:
  - goto: /
  - expect_visible: h1
  - screenshot: home
  - goto: /annonces?ville=Paris
  - wait: 1500
  - expect_count: { selector: "a[href^=\"/annonces/\"]", min: 1 }
  - screenshot: paris-results
```

## Ajouter un nouveau scénario

1. Créer un fichier `qa/scenarios/NN-description.yaml` (NN = ordre alphabétique).
2. Définir `name`, `role`, `priority`, `steps`.
3. Tester localement :
   ```bash
   cd nestmatch
   pnpm qa:run -- qa/scenarios/NN-description.yaml
   ```
4. Si OK, commit + push.
5. Le cron daily exécutera automatiquement ce scénario chaque nuit.

## Lancer un run

### Depuis `/admin/qa` (admin connecté)
- Click "Run" sur la card du scénario.
- Status passe à "running" en DB.
- Runner externe doit ensuite l'exécuter (cf. ci-dessous).

### Depuis CLI local (en dev)
```bash
cd nestmatch
pnpm dev   # démarre Next.js sur http://localhost:3000
# dans un autre terminal
pnpm qa:run qa/scenarios/01-locataire-recherche-paris.yaml
```

### Via cron daily (production)
- `GET /api/cron/qa-daily-run` avec `Authorization: Bearer ${CRON_SECRET}`.
- Schedule prévu : `0 4 * * *` (à activer post-Vercel Pro).

## Debug un fail

1. Ouvrir `/admin/qa`
2. Click sur la row "fail" → modal détail
3. Vérifier :
   - **Erreurs** : message + step_index où ça plante
   - **Screenshots** : capture juste avant le fail
   - **Network errors** : 4xx/5xx pendant le run
   - **Console errors** : JS errors loggés
4. Reproduire localement : `pnpm qa:run <fichier>` + ouvrir Playwright en mode headed pour visualiser : ajouter `headless: false` dans `lib/qa/runner.ts:launch()` (temporaire).
5. Une fois fix : commit + push, le prochain cron daily validera.

## Roadmap

### V83 (MVP — fait)
- ✅ Migration `qa_runs` table
- ✅ Runner Playwright lib/qa/*
- ✅ 5 scénarios YAML
- ✅ Routes API `/api/qa/{run, runs, runs/[id], scenarios}`
- ✅ Page `/admin/qa` avec stats + table + détail modal
- ✅ Cron endpoint `/api/cron/qa-daily-run`
- ✅ Doc complete

### V84+ (à faire)
- 🔄 GitHub Action `.github/workflows/qa-daily.yml` qui poll les runs et exec Playwright
- 🔄 Supabase Storage bucket `qa-screenshots` (créer côté dashboard, public:false)
- 🔄 Fixtures NextAuth pour `login_as` (test users seedés en DB is_test=true)
- 🔄 Scénarios auth-required : bail signature, EDL contradictoire, quittance
- 🔄 Self-heal : si test fail détecte un selector cassé, auto-suggère un fix
- 🔄 Diff visuel : compare screenshot avant/après pour détecter régressions visuelles
- 🔄 Alerte email auto Paul si N fails consécutifs (déjà gère insert incident, manque l'email)

## Sécurité

- Toutes les routes `/api/qa/*` requièrent `session.user.isAdmin` (sauf POST avec Bearer CRON_SECRET pour les runners externes).
- Table `qa_runs` : INSERT/UPDATE/DELETE révoqués pour anon.
- Storage bucket `qa-screenshots` : public:false, URLs signées 1h.
- Screenshots peuvent contenir des données sensibles (emails utilisateurs visibles dans l'UI) → ne JAMAIS public-expose.

## Métriques cibles

- **Pass rate** : ≥ 95% sur 7 jours (Pour les scénarios P0, viser 100%)
- **Duration moyenne** : <30s par scénario (réseau Vercel + page load)
- **Coverage** : ≥ 10 scénarios fin V84 (auth flows ajoutés)
- **MTTR** régression : si fail détecté à 4h matin, fix poussé avant midi (cible)
