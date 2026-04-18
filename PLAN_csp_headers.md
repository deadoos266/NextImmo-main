# PLAN — CSP headers stricts

## 1. Contexte et objectif
Aucun Content Security Policy configuré. Un XSS injecte du JS qui peut exfiltrer cookies, tokens, données. Poser un CSP strict + autres headers de sécurité (X-Frame-Options, HSTS, Permissions-Policy) via `next.config.js`.

## 2. Audit de l'existant

### Ressources externes chargées
- **Fonts** : Google Fonts DM Sans (via `next/font` — cache local, pas de script externe).
- **Maps** : Leaflet tiles depuis OpenStreetMap / CartoDB.
- **Images** : Supabase Storage public URLs.
- **Scripts** : aucun inline significatif sauf le `THEME_SCRIPT` dans `app/layout.tsx` (init thème avant first paint).
- **Analytics/Sentry** : Sentry SaaS endpoint (ingest.sentry.io).

### Headers actuels
Probablement les defaults Vercel (x-content-type-options: nosniff, pas de CSP).

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/next.config.js` | MODIF | Ajouter `headers()` export avec CSP + HSTS + X-Frame + Permissions. |
| `nestmatch/app/layout.tsx` | MODIF | `THEME_SCRIPT` inline → ajouter `nonce` ou le déplacer en fichier statique. |
| `nestmatch/public/_headers` | **NOUVEAU si pas CloudflareCDN** — sinon `next.config.js` suffit | Headers fallback. |

## 4. Migrations SQL
**Aucune**.

## 5. Variables d'env
**Aucune** (CSP se construit statiquement).

## 6. Dépendances
**Aucune** nouvelle.

## 7. Étapes numérotées

### Bloc A — Inventaire sources autorisées
1. Lister dans un commentaire en tête de `next.config.js` toutes les sources utilisées :
    ```
    // CSP sources autorisées :
    // - 'self'                         → assets app
    // - cdn.jsdelivr.net, unpkg.com   → si dépendances CDN (à vérifier)
    // - *.tile.openstreetmap.org       → Leaflet tiles
    // - *.supabase.co                  → Storage images + API + Realtime WS
    // - *.sentry.io                    → Sentry ingest
    // - fonts.gstatic.com              → Google Fonts fallback (next/font normalement cache local)
    ```
2. Faire un grep pour détecter toute URL externe hard-codée :
    ```bash
    grep -rIE "https?://[^\"'\` ]+" app/ lib/ --include="*.tsx" --include="*.ts" | head -50
    ```
    Noter tout domaine rencontré.

### Bloc B — Nonce pour THEME_SCRIPT
3. `app/layout.tsx` contient actuellement :
    ```tsx
    const THEME_SCRIPT = `...`
    <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
    ```
    Options (choisir A ou B) :
    - **A** : Extraire dans `/public/theme-init.js`, inclure via `<script src="/theme-init.js" />` — simple, CSP strict.
    - **B** : Générer un `nonce` unique par request, l'injecter. Complexe avec Next 15 Server Components (nonce doit être re-généré).

    **Option recommandée : A**.

4. Créer `nestmatch/public/theme-init.js` :
    ```js
    (function(){try{var t=localStorage.getItem('nestmatch-theme')||'system';var e=t;if(t==='system'){e=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',e);}catch(_){}})();
    ```
5. Dans `app/layout.tsx`, remplacer :
    ```tsx
    <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
    ```
    par :
    ```tsx
    <script src="/theme-init.js" />
    ```
6. Supprimer la const `THEME_SCRIPT`.

### Bloc C — `next.config.js` headers
7. Ouvrir `nestmatch/next.config.js`. Ajouter méthode `async headers()` :
    ```js
    const CSP_HEADER = [
      "default-src 'self'",
      // scripts : self + inline minimal pour Next.js (hash-based si besoin)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // 'unsafe-inline' obligatoire tant que Next ne supporte pas nonces en App Router proprement
      // 'unsafe-eval' pour React devtools + certaines libs ; à retirer en prod stricte si possible
      "style-src 'self' 'unsafe-inline'",
      // styles inline partout dans le projet — 'unsafe-inline' obligatoire
      "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org https://a.basemaps.cartocdn.com https://b.basemaps.cartocdn.com https://c.basemaps.cartocdn.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.upstash.io https://api.anthropic.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; ")

    const SECURITY_HEADERS = [
      { key: "Content-Security-Policy", value: CSP_HEADER },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
    ]

    /** @type {import('next').NextConfig} */
    const nextConfig = {
      // ... config existante ...
      async headers() {
        return [
          {
            source: "/:path*",
            headers: SECURITY_HEADERS,
          },
        ]
      },
    }
    ```
8. Si `withSentryConfig` déjà en place (Plan Sentry), le wrap doit être **au bout** :
    ```js
    module.exports = withSentryConfig(nextConfig, { ... })
    ```

### Bloc D — Test CSP en dev
9. `npm run dev`
10. Ouvrir la home dans Chrome DevTools → Network → requête document → vérifier header `Content-Security-Policy` présent.
11. Console DevTools : surveiller les violations CSP. Des messages `Refused to load the script because it violates the following Content Security Policy directive` remontent les oublis.
12. Pour chaque violation : soit tu ajoutes le domaine dans `connect-src`/`img-src` approprié, soit tu supprimes la ressource offensante.

### Bloc E — Test routes clés
13. Parcourir rapidement :
    - `/` (home)
    - `/annonces` (Leaflet maps)
    - `/annonces/[id]` (PhotoCarousel, map, SignalerButton)
    - `/messages` (Supabase realtime WebSocket)
    - `/parametres` (upload avatar)
    - `/dossier` (upload docs, génération PDF)
    - `/proprietaire/bail/[id]` (jsPDF)
14. Pour chaque page : noter violations dans DevTools. Corriger CSP au fur et à mesure.

### Bloc F — Report-Only en premier déploiement
15. Pour éviter de casser la prod, envoyer CSP en **report-only** d'abord :
    ```js
    { key: "Content-Security-Policy-Report-Only", value: CSP_HEADER },
    // au lieu de Content-Security-Policy
    ```
16. Déployer en prod. Monitorer les rapports via Sentry ou endpoint custom pendant 48 h.
17. Si zéro violation → switcher en `Content-Security-Policy` strict (enforcing).

### Bloc G — Validation HSTS / submit preload
18. HSTS doit être **seulement après domaine custom** (nestmatch.fr). Sur `next-immo-main.vercel.app`, HSTS est OK sans preload.
19. Quand le domaine custom est up (Phase 3), submit sur https://hstspreload.org/ pour ajouter au preload list Chrome.

## 8. Pièges connus

- **`unsafe-inline` script-src** : obligatoire pour Next 15 App Router car les chunks inline ont pas de nonce auto. Impact sécurité réel modéré (Next protège déjà contre XSS via React). Ne pas s'acharner à l'enlever sans refacto majeure.
- **`unsafe-eval`** : utile en dev (React DevTools), à retirer si possible en prod. Leaflet ne l'exige pas normalement.
- **Styles inline** : tout le projet NestMatch est en styles inline → `'unsafe-inline'` style-src obligatoire. Normal.
- **WebSocket Supabase** : `wss://*.supabase.co` doit être dans `connect-src` sinon realtime casse.
- **Sentry ingest URL** varie selon région. Adapter `connect-src` : `https://*.ingest.sentry.io` ou `https://*.ingest.us.sentry.io` ou `https://*.ingest.de.sentry.io`.
- **Anthropic API** (pour `/api/agent`) : `api.anthropic.com` doit être whitelisté côté **server** uniquement — donc pas besoin dans CSP client. CSP côté client ne s'applique pas aux appels fetch serveur.
- **Google OAuth redirect** : le flow passe par `accounts.google.com` — redirect, pas connect — donc `form-action` + `navigate-to` permissifs. OK par défaut avec `form-action 'self'` car Google redirect pas depuis un form mais via nav.
- **Report-Only d'abord** : ne **jamais** déployer un CSP strict en prod sans passer par report-only. Une violation non détectée = fonction cassée.
- **Cache navigateur** : après changement headers, demander aux users "hard refresh" (Ctrl+Shift+R). Vercel purge la CDN auto mais le navigateur peut bloquer.

## 9. Checklist "c'est fini"

- [ ] `THEME_SCRIPT` extrait dans `/public/theme-init.js`, référencé via `<script src>`.
- [ ] `next.config.js` exporte `headers()` avec CSP + HSTS + 5 autres headers.
- [ ] En dev : header `Content-Security-Policy` présent sur toutes les pages.
- [ ] Zéro violation CSP dans DevTools console sur `/`, `/annonces`, `/messages`, `/dossier`, `/parametres`.
- [ ] Preview Vercel : headers présents (curl `-I` sur l'URL).
- [ ] Phase déploiement : CSP en report-only 48 h, puis enforcing si clean.
- [ ] `next build` OK, `tsc --noEmit` OK.
- [ ] Score securityheaders.com : **A minimum**, viser A+.

---

**Plan mixte** :

- ⚠️ **EXÉCUTION OPUS UNIQUEMENT** : Bloc C (construction du CSP header). Sensibilité élevée : CSP trop strict = app cassée, CSP trop laxe = protection illusoire. Chaque source externe doit être justifiée.
- **OK pour Sonnet** : Bloc A (inventaire), B (extract THEME_SCRIPT), D-F (tests), G (HSTS preload).
