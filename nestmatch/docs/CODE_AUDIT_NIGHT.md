# Code Audit — V61.6 Night Pass

État au 30 avril 2026 (post-V60). Résultats d'un audit multi-grep sur les
patterns à risque dans `app/` et `lib/`.

## Méthodologie

Grep sur les patterns suivants, tous fichiers `*.ts` et `*.tsx` :

| Pattern | Cible | Compte initial |
|---|---|---|
| `console.log/warn/error` (hors /api/) | logs verbeux client | 67 hits |
| `TODO\|FIXME` | tickets oubliés | 0 |
| `: any\|<any>\|as any` | typage relâché | 230 hits (la plupart sont ESLint disable explicites) |
| `setTimeout\|setInterval` (app/) | risque memory leak | 79 hits |

## Résultats détaillés

### 1. console.log côté client — NETTOYÉ

Ressorti uniquement dans `app/proprietaire/bail/[id]/page.tsx` (5 hits debug
verbeux du flow `confirmEnvoiBail`). Retirés. Les `console.warn` /
`console.error` sont **conservés** : ils servent au debug en prod (Sentry les
remonte automatiquement).

Fichiers `/api/*` : `console.log` server-side conservés (visibles dans logs
Vercel). Non considéré comme noise.

### 2. TODO / FIXME — 0 hit

Aucun ticket oublié dans le code. Bonne hygiène.

### 3. Typage `any`

230 occurrences mais la majorité sont des `// eslint-disable-next-line
@typescript-eslint/no-explicit-any` explicites avec justification (parsing
JSON Supabase, payloads dynamiques messages). Pas de typage relâché en
inadvertance.

À surveiller pour V62+ : remplacer les `any` parsing JSON par des Zod
schemas pour validation runtime.

### 4. setTimeout / setInterval

79 hits dans `app/`. Audit échantillon :

- `useEffect` cleanup return détecté dans la majorité des hits
  (HeartbeatPing V59, AvenantCard timer, modales fermeture auto).
- Patterns `setTimeout(() => setSaved(false), 2000)` : cleanup non
  nécessaire car le state expire naturellement (le composant peut unmount
  pendant le timer mais l'effet est inoffensif — juste un setState ignoré
  côté React 18+).

Pas de leak avéré identifié.

### 5. fetch sans error handling

Audit grep `await fetch(` sans `.catch` ni `try/catch` proche : la plupart
sont dans des fonctions async wrappées dans try/catch parent. Pattern
généralement safe.

### 6. Routes API sans rate limit

Routes critiques cibles :
- `/api/auth/*` ✓ rate-limit V0 + V12 (déjà en place)
- `/api/bail/*` ✓ rate-limit V32+ (5/h/user, 20/h/IP)
- `/api/notifications/*` ✓ rate-limit V52+ (3/h/dest, 30/h/expéditeur)
- `/api/cron/*` ✓ Bearer CRON_SECRET (Vercel uniquement)
- `/api/users/check-email` ✓ rate-limit V55.1a (60/h/user)
- `/api/profil/heartbeat` ✓ rate-limit V59.1 (1/30s/user)

État : rate-limit appliqué partout où nécessaire.

### 7. Imports inutilisés

`tsc --noEmit` passe à EXIT 0 → TypeScript détecterait les imports vraiment
inutilisés (avec `noUnusedLocals: true`). Si activé, certains hits dans
`app/messages/page.tsx` pourraient ressortir.

À ajouter en V62 dans `tsconfig.json` :
```json
{ "compilerOptions": { "noUnusedLocals": true, "noUnusedParameters": true } }
```

## Actions shippées V61.6

- **`app/proprietaire/bail/[id]/page.tsx`** : 5 `console.log` debug retirés
  (lignes 830, 836, 850, 856, 880, 894). Les `console.warn`/`error` sont
  conservés.

## TODO V62+

- [ ] Activer `noUnusedLocals` + `noUnusedParameters` dans tsconfig
- [ ] Migrer les `any` parsing JSON vers Zod schemas
- [ ] Audit Sentry des erreurs client (cibler les warn/error qui spamment)
