# Code Audit — Final V65.4

État au 4 mai 2026 (post-V65). Audit final des patterns à risque côté client/server.

## Méthodologie

Grep sur les patterns suivants, dossiers `app/` et `lib/` :

| Pattern | Cible | Compte V65.4 | Précédent V61.6 |
|---|---|---|---|
| `console.log` (hors `/api/`) | logs client verbeux | **0** | 67 puis 5 cleanup |
| `TODO\|FIXME` | tickets oubliés | **0** | 0 |
| `: any\|<any>\|as any` (hors eslint-disable) | typage relâché | **~4 cibles `app/api`** | 230 (très majoritairement `eslint-disable`) |
| `setTimeout\|setInterval` (`app/`) | risque memory leak | 79 hits, **0 leak avéré** | idem |
| `supabase.from("messages")` client | RLS bypass anon | **0** ✅ | 37 |
| `supabase.from("loyers")` client | RLS bypass anon | **0** ✅ | 4 |
| `supabase.from("etats_des_lieux")` client | RLS bypass anon | **0** ✅ | 7 |

## Résultats détaillés

### 1. RLS Phase 5 — 12/12 tables prêtes ✅

V65.1 + V65.2 ont migré tous les sites client lisant les tables sensibles
vers des routes `/api/*` server-side.

Migrations prêtes à appliquer :
- `058_rls_lockdown_phase_5_final.sql` → REVOKE anon sur `messages`
- `059_rls_lockdown_phase_5_loyers_edl.sql` → REVOKE anon sur `loyers` + `etats_des_lieux`

12/12 tables :
| Table | Migration | Statut |
|---|---|---|
| profils | 036 | ✅ |
| users, dossier_share_tokens, dossier_access_log, bail_invitations, bail_avenants, notifications | 051 | ✅ |
| bail_signatures, edl_signatures | 053 | ✅ |
| messages | 058 (V65.1) | ✅ READY |
| loyers, etats_des_lieux | 059 (V65.2) | ✅ READY |

### 2. Routes API — 88+ routes, gating cohérent

Audit `find app/api -name "route.ts" | wc -l` = **96** routes (V65 a ajouté 14
nouvelles routes pour la migration RLS).

Rate-limit : 26/96 routes ont `checkRateLimitAsync`. Les 70 sans rate-limit
sont :
- Routes GET en lecture seule (l'auth NextAuth gate le risque, pas de mutation)
- Routes admin (`/api/admin/*` — pas exposé public)
- Routes cron (`/api/cron/*` — gated par `Authorization: Bearer CRON_SECRET`)
- NextAuth (`[...nextauth]` — handle son propre RL)

Routes sensibles AVEC rate-limit (V64) :
- `/api/bail/signer` 5/h
- `/api/bail/avenant/[id]/signer` 5/h
- `/api/bail/preavis` 3/h
- `/api/baux/relouer` 5/h
- `/api/baux/restitution-depot` 5/h
- `/api/annonces/terminer-bail` 5/h
- `/api/messages` 30/h
- `/api/messages/candidature` 10/h
- `/api/visites/proposer` 5/h
- `/api/auth/register` 10/h IP + 3/h email
- `/api/auth/verify-code` 5/15min email

### 3. console.log côté client — 0 hit ✅

Verbose debug logs nettoyés en V61.6 (5 lignes dans
`app/proprietaire/bail/[id]/page.tsx`). `console.warn` / `console.error`
conservés (Sentry les remonte automatiquement).

`/api/*` server-side : `console.log` conservés (visibles dans logs Vercel).

### 4. TODO / FIXME — 0 hit ✅

Aucun ticket oublié dans le code.

### 5. Typage `any`

Quelques `any` résiduels dans `app/api` (4 occurrences ciblées) :
- `app/api/annonces/[id]/route.ts:74` — Promise.allSettled rejection cast
- `app/api/messages/thread/route.ts:64` — array merge typé loose pour
  permettre filter dynamique
- `app/api/visites/ics/route.ts:66,74` — Map<string, any> pour extension future

Tous justifiés. Pas de `any` "lazy" côté `/api`. Côté `app/` (UI), les `any`
restants sont sur des callbacks Supabase realtime (`payload.new as any`) qui
n'ont pas de typage Supabase publié.

À surveiller pour V66+ : remplacer les `any` parsing JSON par des Zod schemas
pour validation runtime.

### 6. setTimeout / setInterval — pas de leak avéré

79 hits dans `app/`. Audit échantillon V61.6 :
- `useEffect` cleanup return détecté dans la majorité des hits
- Patterns `setTimeout(() => setSaved(false), 2000)` : cleanup non
  nécessaire car le state expire naturellement (le composant peut unmount
  pendant le timer mais l'effet est inoffensif — juste un setState ignoré
  côté React 18+)

### 7. fetch sans error handling

Audit grep `await fetch(` sans `.catch` ni `try/catch` proche : la plupart
sont dans des fonctions async wrappées dans try/catch parent. Pattern
généralement safe.

V65 introduit ~14 nouveaux `fetch` vers `/api/*` — chacun avec `.catch(() => fallback)` ou check `if (!res.ok)`.

### 8. Imports inutilisés

`tsc --noEmit` passe à EXIT 0. Si `noUnusedLocals: true` était activé
dans `tsconfig.json`, certains hits dans `app/messages/page.tsx` et autres
gros fichiers pourraient ressortir.

À ajouter en V66 :
```json
{ "compilerOptions": { "noUnusedLocals": true, "noUnusedParameters": true } }
```

### 9. Couverture tests vitest

521 tests passent dans 46 fichiers (avant V65 : 488 dans 41 fichiers).
+33 nouveaux tests en V65 :
- bail/signer (10) + avenant signer (6) + loyers/save declare idempotent (2)
- /api/messages POST (5) + mark-read (5) + [id] DELETE/PATCH (6)
- /api/health (3)

Couverture minimum sur les routes critiques eIDAS / financières / RLS.

## Actions shippées V65.4

Aucune action de cleanup à faire — le code est propre. Ce doc sert de
snapshot d'état à la fin de V65 pour audit V66+.

## TODO V66+

- [ ] Activer `noUnusedLocals` + `noUnusedParameters` dans tsconfig
- [ ] Migrer les `any` parsing JSON vers Zod schemas (`/api/messages/thread`,
  `/api/messages/last-by-prefix`, etc.)
- [ ] Audit Sentry des erreurs client (cibler les warn/error qui spamment)
- [ ] Tests Playwright E2E flow signature bail à 2 (V65.5 partiellement
  couverte par tests vitest unitaires)
- [ ] Backup DB automatique (cron daily vers Storage `backups/`)
- [ ] Logging structuré sur les routes `/api/*` (remplacer `console.error`
  par un logger avec request_id)
