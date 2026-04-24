<!-- LIVRE 2026-01 -->
<!-- Evidence: sentry.*.config.ts + instrumentation.ts -->

# PLAN — Sentry monitoring front + API

## 1. Contexte et objectif
Aucun monitoring prod aujourd'hui. Une exception serveur silencieuse = bug invisible. Un crash React client → user bloqué, personne ne sait. Installer Sentry (free tier 5k events/mois) pour capter automatiquement erreurs front + API routes, avec source maps pour stacktraces lisibles.

## 2. Audit de l'existant

### Ce qui existe
- `app/error.tsx` et `app/global-error.tsx` (error boundaries Next 14+).
- Quelques `console.error` dans les API routes (`/api/edl/[id]`, `/api/account/avatar`, etc.).
- Aucun agrégateur. Les erreurs disparaissent.

### Ce qui manque
- Capture automatique erreurs runtime front.
- Capture automatique erreurs API routes.
- Contexte user (email, role) attaché aux erreurs.
- Source maps uploadées pour stacktraces minifiées lisibles.
- Alerte email si spike d'erreurs.

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/sentry.client.config.ts` | **NOUVEAU** | Config SDK client (Next.js wizard génère). |
| `nestmatch/sentry.server.config.ts` | **NOUVEAU** | Config SDK Node (API routes). |
| `nestmatch/sentry.edge.config.ts` | **NOUVEAU** | Config Edge Runtime (middleware). |
| `nestmatch/next.config.js` | MODIF | Wrap config via `withSentryConfig`. |
| `nestmatch/instrumentation.ts` | **NOUVEAU** | Next 14+ standard pour init côté serveur. |
| `nestmatch/app/error.tsx` | MODIF | Appeler `Sentry.captureException` dans error boundary. |
| `nestmatch/app/global-error.tsx` | MODIF | Même chose. |
| `nestmatch/app/providers.tsx` | MODIF | Attacher `Sentry.setUser` quand session dispo. |
| `nestmatch/.env.local.example` | MODIF | Ajouter vars Sentry. |

## 4. Migrations SQL
**Aucune**.

## 5. Variables d'env

```bash
# Sentry
SENTRY_DSN=https://<publicKey>@o<orgId>.ingest.sentry.io/<projectId>
NEXT_PUBLIC_SENTRY_DSN=<même DSN>
SENTRY_ORG=<org slug>
SENTRY_PROJECT=<project slug>
SENTRY_AUTH_TOKEN=<token avec scope project:releases>   # pour source maps CI
```

`SENTRY_AUTH_TOKEN` ne va PAS dans `.env.local` local — il est dans **Vercel env vars** uniquement (build-time secret).

## 6. Dépendances

```bash
cd nestmatch
npm install @sentry/nextjs
```

Puis le wizard officiel (optionnel mais recommandé) :
```bash
npx @sentry/wizard@latest -i nextjs
```
Il détecte Next 15, génère les 3 config files et update `next.config.js`. **Laisser le wizard faire** plutôt que tout écrire à la main.

## 7. Étapes numérotées

### Bloc A — Compte Sentry
1. Créer compte sur https://sentry.io/signup/. Free tier = 5k events/mois, largement suffisant au début.
2. Créer organization "NestMatch" (ou nom existant).
3. Créer projet → Platform : **Next.js** → récupère automatiquement DSN.
4. Dans Settings → Account → Auth Tokens, créer token avec scopes :
   - `project:releases`
   - `org:read`
   Noter le token → ira dans Vercel env `SENTRY_AUTH_TOKEN`.

### Bloc B — Install via wizard (recommandé)
5. `cd nestmatch && npm install @sentry/nextjs`
6. `npx @sentry/wizard@latest -i nextjs`
    - Accepte DSN récupéré ou copié.
    - Accepte création des 3 config files.
    - Active "tracing" (performance monitoring) : **non pour l'instant** (consomme events).
    - Active "session replay" : **non** (cher, active plus tard si besoin).
7. Le wizard modifie `next.config.js` pour envelopper avec `withSentryConfig`. Vérifier.

### Bloc C — Review config générée
8. Ouvrir `sentry.client.config.ts`. Valeurs recommandées :
   ```ts
   Sentry.init({
     dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
     tracesSampleRate: 0.1,          // 10% des requêtes
     replaysSessionSampleRate: 0,    // pas de session replay
     replaysOnErrorSampleRate: 0,
     environment: process.env.NODE_ENV,
     ignoreErrors: [
       "ResizeObserver loop limit exceeded",
       "NetworkError when attempting to fetch resource",
       "AbortError: The user aborted a request",
       /Non-Error promise rejection captured/,
     ],
   })
   ```
9. Ouvrir `sentry.server.config.ts`. Même DSN, même env, pas de replay.
10. Ouvrir `sentry.edge.config.ts`. Config minimale (DSN + env).

### Bloc D — Context user
11. Dans `app/providers.tsx`, ajouter après le `SessionProvider` :
    ```tsx
    "use client"
    import * as Sentry from "@sentry/nextjs"
    import { useSession } from "next-auth/react"
    import { useEffect } from "react"

    function SentryUser() {
      const { data: session } = useSession()
      useEffect(() => {
        if (session?.user?.email) {
          Sentry.setUser({
            email: session.user.email,
            id: session.user.email, // ou un ID opaque si préféré
          })
        } else {
          Sentry.setUser(null)
        }
      }, [session?.user?.email])
      return null
    }
    ```
    Monter `<SentryUser />` dans le Provider wrapper.

### Bloc E — Error boundaries
12. Dans `app/error.tsx` (client error boundary), ajouter :
    ```tsx
    "use client"
    import * as Sentry from "@sentry/nextjs"
    import { useEffect } from "react"

    export default function Error({ error, reset }: { error: Error; reset: () => void }) {
      useEffect(() => {
        Sentry.captureException(error)
      }, [error])
      return <div>Une erreur est survenue. <button onClick={reset}>Réessayer</button></div>
    }
    ```
13. Idem dans `app/global-error.tsx`.

### Bloc F — API routes capture
14. Sentry Next.js SDK wrap automatiquement les API routes via `instrumentation.ts`. Vérifier le fichier `instrumentation.ts` créé par le wizard contient :
    ```ts
    export async function register() {
      if (process.env.NEXT_RUNTIME === "nodejs") {
        await import("./sentry.server.config")
      }
      if (process.env.NEXT_RUNTIME === "edge") {
        await import("./sentry.edge.config")
      }
    }
    ```
15. Pas besoin d'ajouter `Sentry.captureException` manuellement dans chaque route — le SDK le fait via hooks Next.

### Bloc G — Filtres PII
16. Dans `sentry.server.config.ts`, ajouter `beforeSend` pour strip données sensibles :
    ```ts
    beforeSend(event) {
      // Strip cookies et headers sensibles
      if (event.request?.headers) {
        delete event.request.headers.authorization
        delete event.request.headers.cookie
      }
      // Strip body si présent
      if (event.request?.data && typeof event.request.data === "object") {
        const sensitiveKeys = ["password", "currentPassword", "newPassword", "token", "secret"]
        for (const k of sensitiveKeys) {
          if (k in event.request.data) (event.request.data as Record<string, unknown>)[k] = "[Filtered]"
        }
      }
      return event
    }
    ```
17. Idem côté client si applicable.

### Bloc H — Déclencher un test
18. En dev : rajouter temporairement dans `/app/page.tsx` un bouton :
    ```tsx
    <button onClick={() => { throw new Error("Sentry test") }}>Test Sentry</button>
    ```
19. Cliquer → l'erreur doit apparaître dans Sentry dashboard en < 30 sec.
20. Supprimer le bouton test.
21. Test côté API : créer temporairement une route `/api/test-sentry` qui throw. Call curl, vérifier event dans Sentry. Supprimer.

### Bloc I — Source maps upload (build)
22. Le wizard a configuré automatiquement. Vérifier `next.config.js` contient bien `withSentryConfig` avec options :
    ```js
    silent: !process.env.CI,
    widenClientFileUpload: true,
    hideSourceMaps: true,
    disableLogger: true,
    ```
23. Build en local : `npm run build` — vérifier logs qu'il y a une ligne "Uploading source maps to Sentry".
24. Si pas connecté → ajouter `SENTRY_AUTH_TOKEN` dans `.env.local`.

### Bloc J — Vercel env vars
25. Vercel dashboard → Settings → Environment Variables → ajouter pour les 3 envs (Production/Preview/Development) :
    - `NEXT_PUBLIC_SENTRY_DSN` (public, peut être dans bundle client)
    - `SENTRY_DSN` (idem, ok)
    - `SENTRY_ORG`
    - `SENTRY_PROJECT`
    - `SENTRY_AUTH_TOKEN` (**Production only** — évite d'upload source maps sur preview)

### Bloc K — Alerte email
26. Sentry dashboard → Alerts → Create Alert Rule :
    - Trigger : "When an event's level equals error" + "When an event's frequency above 5 per 1 hour"
    - Action : Email to admin@nestmatch.fr (ou perso)
27. Sauver.

## 8. Pièges connus

- **Events consumption** : `tracesSampleRate` élevé = explosion events. 0.1 (10%) est un bon compromis.
- **PII leak** : sans `beforeSend` filter, Sentry peut recevoir mots de passe, tokens, cookies. Filtrer impérativement (Bloc G).
- **Source maps en preview** : `SENTRY_AUTH_TOKEN` en Preview = upload à chaque PR = explosion quota. Garder en Production only.
- **Next 15 + App Router** : assure-toi que le wizard détecte App Router. Sinon suivre la doc manuelle.
- **`ignoreErrors`** : bien filtrer les "non-erreurs" (ResizeObserver, AbortError, etc.) sinon bruit parasite.
- **NextAuth session** : `Sentry.setUser` dans un client component uniquement (useSession). Côté serveur, les API routes héritent via contexte request.
- **`replay` désactivé** : activation coûteuse (100x events). Ne pas l'activer sans budget.
- **`/api/agent` LLM** : les erreurs Anthropic peuvent flood Sentry (rate-limit, token expired). Tagger dans `beforeSend` et filtrer ou samper différemment.

## 9. Checklist "c'est fini"

- [ ] Compte Sentry créé, projet NextJS créé, DSN récupéré.
- [ ] `@sentry/nextjs` installé, wizard exécuté.
- [ ] `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts` présents.
- [ ] `next.config.js` wrap avec `withSentryConfig`.
- [ ] `app/error.tsx` et `app/global-error.tsx` appellent `Sentry.captureException`.
- [ ] `app/providers.tsx` attache user context via `Sentry.setUser`.
- [ ] `beforeSend` strip les clés sensibles (password, token, cookie).
- [ ] Test : déclenche erreur volontaire → visible dans Sentry dashboard en < 1 min.
- [ ] Vercel env vars configurées pour Production + Preview.
- [ ] Alerte email configurée pour > 5 erreurs/heure.
- [ ] `tsc --noEmit` clean, `next build` passe.

---

**Plan mixte** :

- ⚠️ **EXÉCUTION OPUS UNIQUEMENT** : Bloc G (filtres PII `beforeSend`) — sensible. Si mal fait, Sentry reçoit mots de passe en clair.
- **OK pour Sonnet** : tous les autres blocs A-F, H-K.
