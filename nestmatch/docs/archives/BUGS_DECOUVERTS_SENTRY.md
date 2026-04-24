<!-- ARCHIVE - 2026-04-24 -->
<!-- Bug #1 (hydration mismatch React #418) : RESOLU par commits c4df3f7 (root cause theme-init.js pre-hydration) + 7303c71 (ThemeApplier client post-mount). Verifie sur 6 pages + dark mode clean. -->
<!-- Bug #2 (TypeError poll Sentry extension) : FAUX POSITIF, erreur provenait d'une extension navigateur, pas du code NestMatch. -->
# Bugs découverts via Sentry (2026-04-19)

Dès le branchement Sentry, 2 bugs réels sont remontés spontanément. À fixer en passe suivante, **pas prioritaires** mais à ne pas oublier.

## Bug #1 — Hydration mismatch SSR/client

**Erreur** : `Hydration failed because the server rendered text didn't match the client`
**Trend** : 1 occurrence (8 min après activation Sentry)
**Priorité** : moyenne

**Cause probable** :
- `<script src="/theme-init.js">` dans `app/layout.tsx` modifie `document.documentElement.setAttribute('data-theme', ...)` avant le premier render React.
- Next compare le HTML SSR (sans data-theme) au DOM client (avec data-theme) → mismatch.

**Fix** :
Ajouter `suppressHydrationWarning` sur `<html>` dans `app/layout.tsx` pour signaler à Next que cette différence est voulue :
```tsx
<html lang="fr" className={dmSans.variable} suppressHydrationWarning>
```

## Bug #2 — TypeError poll inconnu

**Erreur** : `TypeError: Object [object Object] has no method 'updateFrom'`
**Origine stack** : `sentry/scripts/views.js in poll`
**Priorité** : faible

**Cause probable** :
- Erreur dans le **tunnel Sentry** (`tunnelRoute: "/monitoring"`) OU dans une extension navigateur qui fait du polling sur le tab Sentry.
- Probablement pas du code NestMatch.

**À faire** :
- Observer dans 48 h si ça se reproduit avec volume.
- Si oui : regarder la stack complète dans Sentry.
- Si origine = notre code : fix ciblé.
- Si origine = extension navigateur tierce : ignorer + ajouter au `ignoreErrors` de `sentry.client.config.ts`.
