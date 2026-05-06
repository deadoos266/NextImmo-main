# Audit Layout KeyMatch — 2026-05-06

Agent : `accessibility-tester` + `code-reviewer` (combinés). Mode read-only.
Scope : `app/layout.tsx` + 12 composants chrome racine + `useResponsive`.

---

## 1. État actuel

### 1.1 Hiérarchie z-index (mappée sur tous les `position: fixed/sticky`)

| z-index | Élément | Fichier | Notes |
|---:|---|---|---|
| 12000 | ToastStack | `ToastStack.tsx:194` | Couche la plus haute (volontaire — interrompt drawer) |
| 11001 | Drawer mobile (panneau) | `Navbar.tsx:777` | Burger menu, slide-in left |
| 11000 | Drawer mobile (scrim) | `Navbar.tsx:749` | Overlay 0.45 noir |
| 10000 | Navbar (sticky top) | `Navbar.tsx:349` | Sticky, hauteur 72 |
| 9000-9001 | Modaux app génériques | `ui/Modal.tsx`, `QuickViewModal`, `AnnulerVisiteDialog`, `QualiteAnnonceBadgeAdaptive` | Inconsistant avec 13000-13500 (bail) |
| 13000-13500 | Modaux bail | `BailPreviewModal`, `PreavisModal`, `AvenantCard`, `ProposerAvenantModal`, `bail-invitation` | **Au-dessus de la Navbar et du drawer** — anomalie |
| 8500 | CookieBanner full + CompareTray | `CookieBanner.tsx:220`, `CompareTray.tsx:70` | Sous drawer ; collision z-index avec CompareTray |
| 8400 | CompareTray scrim | `CompareTray.tsx:109` | |
| 8000 | StickyCTABanner annonce + PWAInstallBanner | `StickyCTABanner.tsx:93`, `PWAInstallBanner.tsx:116` | Mêmes z-index → si les 2 visibles simultanément, ordre indéterministe |
| 7500 | FiltersModal | `FiltersModal.tsx:242` | |
| 7200 | Map modale mobile | `AnnoncesClient.tsx:2228` | |
| 6000-6100 | FiltersBar + SavedSearchesPopover | `FiltersBar.tsx:151`, `SavedSearchesPopover.tsx:138` | |
| 5000 | BookingVisite, EquipementsModal, MobileMapCarousel | | |
| 2000 | DpeBadge popover | | |
| 1100 | AdminBar (sticky top) | `AdminBar.tsx:48` | **Sous la Navbar (10000) mais elle prétend être au-dessus** — voir bug 2.4 |
| 1000-998 | ContactButton, ShareButton, SharePanel | | |
| 400 | FloatingCookieButton (pill 🍪) | `CookieBanner.tsx:105` | Bottom-right 20px |
| 100-101 | AddToCalendarButton, AddressAutocomplete | | |
| 50, 40, 20 | Filters dropdowns + dossier sticky | | |

**Problème majeur** : aucune source de vérité (pas de `lib/zIndex.ts`). 6+ fichiers commentent essayer de documenter la hiérarchie de manière contradictoire (`Navbar.tsx:743-748` dit "Navbar 10000 < drawer 11000 < toasts 12000" mais ignore que les modaux bail sont à 13000-13500).

### 1.2 Composants montés au layout root (`app/layout.tsx:202-247`)

Ordre de mount dans `<body><Providers>` :

1. `ThemeApplier` — applique theme post-mount (fix React #418)
2. `BetaBanner` — bandeau jaune top, dismissable
3. `AdminBar` — sticky top admin uniquement
4. `Navbar` (wrappé `MountedOnly` height 72 fallback) — sticky top
5. `{children}` — contenu page
6. `Footer` (wrappé `MountedOnly`) — masqué sur `/annonces`, `/messages*`
7. `CookieBanner` — fixed bottom (banner ou pill 🍪)
8. `PWAInstallBanner` — fixed bottom 12px (mobile only)
9. `ToastStack` — portal vers body, fixed bottom-right
10. `ServiceWorkerRegister` — invisible
11. `ZoomGuard` — invisible (visualViewport watcher)
12. `ScrollLockReset` — invisible (overflow body cleanup)
13. `HeartbeatPing` — invisible (60s POST /api/profil/heartbeat)

**13 mounts client** sur chaque page = coût render non-négligeable + chaque banner peut entrer en collision visuelle.

### 1.3 Stratégie responsive

Hook unique `useResponsive` (`hooks/useResponsive.ts`) :
- Breakpoints : `isMobile < 640`, `isTablet 640-1024`, `isDesktop >= 1024`
- Pré-mount = desktop (width=1200) pour SSR/CSR parity
- `mounted` exposé mais peu utilisé (seul Navbar fallback height 72 dans layout)

**Pas de breakpoint media-query** — tout JS-driven. Coût : flash desktop sur mobile pendant ~50ms post-hydration.

### 1.4 Patterns utilisés

- **Sticky** : Navbar (top:0, z:10000), AdminBar (top:0, z:1100) → empilent en haut quand admin
- **Fixed** : drawer, scrims, modaux, banners, FAB cookies, toasts
- **MountedOnly wrapper** : Navbar + Footer (anti React #418)
- **Custom events** : `km:drawer-state`, `km:thread-active`, `km:thread-mobile-open`, `km:messages-route-active`, `km:toast` — chrome ↔ pages
- **localStorage flags** : `keymatch_beta_dismissed_v1`, `pwa_install_dismissed`, `cookie_consent` (3 banners séparés, 3 keys séparées)

---

## 2. Bugs identifiés

### 2.1 🔴 P0 — Empilement banners top non-coordonné

`layout.tsx:222-231` mounts dans l'ordre `BetaBanner` → `AdminBar` → `Navbar`. Sur user admin avec beta active, le top empile **3 sticky bars** (BetaBanner ~38px + AdminBar ~32px + Navbar 72px = ~142px). Aucun `top` calculé : Navbar a `top: 0` (sticky) en parallèle d'AdminBar `top: 0` (sticky), ce qui empile via flow normal MAIS avec z-index Navbar=10000 vs AdminBar=1100 → **AdminBar passe sous la Navbar quand on scroll**.
**Fix** : grouper les 3 dans un `<TopChrome>` flex column, calculer la hauteur dynamique pour offset les pages.

### 2.2 🔴 P0 — Modaux bail dépassent la Navbar et le drawer

`BailPreviewModal:13000`, `PreavisModal:13500`, `AvenantCard:13500`, `ProposerAvenantModal:13500`, `TutoProprio:13500`, `bail-invitation:13000` sont tous **au-dessus de la Navbar (10000) et du drawer (11000)**. Un modal bail ouvert masque visuellement le burger : impossible d'ouvrir le menu pour quitter. Volonté assumée pour les modaux fullscreen mais le commentaire `Navbar.tsx:744-748` dit l'inverse et ne mentionne pas la couche 13000+.
**Fix** : créer `lib/zIndex.ts` avec layers nommées (`navbar=10000`, `drawer=11000`, `modal=11500`, `toast=12000`), refactoring 30+ fichiers.

### 2.3 🟠 P1 — Trois banners bottom qui se chevauchent

CookieBanner full (z:8500, bottom:0, full-width), PWAInstallBanner (z:8000, bottom:12, left:12, right:12), FloatingCookieButton (z:400, bottom:20, right:20), ToastStack (z:12000, bottom:20, right:20). Sur mobile, **PWA + Toast + 🍪 pill collisionnent visuellement** (bottom-right 20px). Pas de coordination.
**Fix** : voir section 5 — bottom-stack unifié.

### 2.4 🟠 P1 — AdminBar prétend être sticky top mais Navbar la déborde

`AdminBar.tsx:46-48` : `position: sticky; top: 0; zIndex: 1100`. Navbar `position: sticky; top: 0; zIndex: 10000`. Les 2 ont `top: 0` et empilent en flow normal, mais quand on scrolle au-delà de l'AdminBar, sa zIndex 1100 < 10000 → la Navbar la **recouvre visuellement** (au lieu de juste push-down). Sur admin mobile, on perd la barre admin au scroll.
**Fix** : AdminBar `top: 72` (hauteur Navbar) ou wrapper sticky combiné.

### 2.5 🟠 P1 — `ZoomGuard` réécrit `body.overflow` en string vide → conflit avec scroll-lock modaux

`ZoomGuard.tsx:38-39` reset `document.body.style.overflow = ""` à chaque event `visualViewport.resize/scroll`. Si un modal est ouvert et a posé `overflow: hidden`, le pinch-zoom in déclenchera **un déblocage du scroll body en pleine modal**. Les 2 systèmes (`ZoomGuard` et `ScrollLockReset`) se battent contre les modaux.
**Fix** : ZoomGuard ne doit reset que si `vv.scale < 0.99` ET aucune modale ouverte (flag global).

### 2.6 🟠 P1 — `viewport user-scalable: false` viole WCAG 1.4.4 (recoupé audit V70)

`layout.tsx:80-87` : `maximumScale: 1, userScalable: false`. Bloque les utilisateurs malvoyants qui zoom in via pinch (pas seulement out). Audit 11-site-health.md ligne 137 confirme.
**Fix** : `maximumScale: 5, userScalable: true` + traiter le bug "scroll bloqué quand dezoom" autrement (CSS `min-width: 100vw` sur body, ou `overflow-x: hidden` sur html).

### 2.7 🟠 P1 — Flash desktop→mobile pré-hydration

`useResponsive` retourne `width=1200` (desktop) avant mount. Sur mobile, le premier paint affiche la nav desktop pendant ~50ms puis switch en burger. CLS visible.
**Fix** : SSR via `User-Agent` header (mais coûte un fetch) OU fallback CSS-only `@media (max-width: 640px) { .desktop-nav { display: none } }` en doublon des conditions JS.

### 2.8 🟢 P2 — `dispatchEvent('km:drawer-state')` au mount sans listener garanti

`Navbar.tsx:238-241` dispatch `km:drawer-state` au mount avec `mobileOpen=false`. Aucun listener documenté dans le code. Légacy event ?
**Fix** : grep usages, supprimer si orphelin.

### 2.9 🟢 P2 — 4 listeners custom-events Footer/AdminBar dupliqués

Footer et AdminBar écoutent **les mêmes** events (`km:thread-active`, `km:messages-route-active`) avec **la même logique** (set state + return null). Code dupliqué.
**Fix** : hook `useChromeVisibility()` partagé.

### 2.10 🟢 P2 — Dimension Navbar `72` hardcodée 4× (au moins)

`Navbar.tsx:350`, `layout.tsx:229` (fallback), `Navbar.tsx:771-773` (drawer top:72, calc(100vh-72px)). Si on change la hauteur Navbar, 4 endroits à toucher.
**Fix** : constante `NAVBAR_HEIGHT` exportée.

### 2.11 🟢 P2 — `CookieBanner` lit `localStorage` en SSR-unsafe (`getStoredConsent` typeof window check OK), MAIS premier render ≠ mount

Le banner s'affiche puis disparaît si l'user a déjà consenti. CLS visible sur page reload.
**Fix** : wrap dans `MountedOnly`.

### 2.12 🟢 P2 — `ToastStack` portal vers `document.body` mais reactivité conflictuelle

`createPortal` rend hors layout, donc échappe au `<Providers>` context. Marche aujourd'hui car les listeners (Supabase, custom events) sont enregistrés sur window directement, pas via context.

### 2.13 🟢 P2 — Footer importe `style` global via `<style>` tag (`@import` Google Fonts)

`Footer.tsx:102-106` injecte un `<style>` avec `@import url('googleapis.com/.../Fraunces')` à chaque mount. Or Fraunces est déjà chargé via `next/font` dans layout (l. 48). Double-fetch + render-blocking @import.
**Fix** : retirer `@import`, utiliser la CSS variable `--font-fraunces`.

### 2.14 🟢 P2 — `MountedOnly` autour du Footer sans fallback height

`layout.tsx:233-235` : `<MountedOnly><Footer /></MountedOnly>` sans fallback. CLS visible (footer apparaît post-mount avec sa hauteur réelle ~400px).
**Fix** : fallback `<div style={{ height: 320 }} aria-hidden />`.

### 2.15 🟢 P2 — `BetaBanner` auto-hide on scroll mais pas le AdminBar voisin

`BetaBanner` translate -110% au scroll-down (`useAutoHideOnScroll`). AdminBar ne suit pas → désync visuelle quand un admin scroll en mode beta.
**Fix** : appliquer `useAutoHideOnScroll` aussi à AdminBar OU grouper les top-bars dans un wrapper hidable.

### 2.16 🟢 P2 — `Logo` charge variant en runtime via `useResponsive`

`Navbar.tsx:366` : `<Logo variant={isSmall ? "compact" : "navbar"} />`. Pré-mount, `isSmall=false` → variant desktop sur mobile pendant ~50ms.

### 2.17 🟢 P2 — `RoleSwitchToggle` dupliqué desktop dropdown + mobile drawer

`Navbar.tsx:530-532` (desktop dropdown) + `:838` (mobile drawer). Même composant, 2 mounts simultanés possibles si on resize.

### 2.18 🟢 P2 — `Footer` recopie liens "informations" 2× (head + footer-bar)

`Footer.tsx:218-227` (col Informations) + `:251-263` (footer-bar bottom). Dup de `Confidentialité, Cookies, CGU, CGV, Mentions légales`. Penalité SEO mineure (footer dup-links).

### 2.19 🟢 P2 — Pas d'ARIA `role="banner"` sur Navbar/AdminBar/BetaBanner

Bonne pratique a11y : top-chrome doit être `role="banner"` ou `<header>` plutôt que `<nav>` (la Navbar est `<nav>` qui contient un `<header>` implicite). WCAG 1.3.1.

---

## 3. Recommandations refonte

### P0 (cette semaine — débloque V72)

| # | Action | Gain UX | Effort | Risque |
|---|---|:---:|:---:|:---:|
| R1 | Créer `lib/zIndex.ts` source de vérité (8 layers nommées) + refactor 30+ fichiers | 8 | 1j | medium |
| R2 | Wrapper `<TopChrome>` regroupant BetaBanner + AdminBar + Navbar avec offset auto | 7 | 4h | medium |
| R3 | Restaurer `userScalable: true` (a11y) + bug scroll-lock zoom traité via CSS | 9 | 2h | low |
| R4 | Constante `NAVBAR_HEIGHT = 72` exportée + utilisée partout | 5 | 1h | low |

### P1 (V73)

| # | Action | Gain UX | Effort | Risque |
|---|---|:---:|:---:|:---:|
| R5 | Hook `useChromeVisibility()` factorisant les listeners `km:*` | 4 | 2h | low |
| R6 | `<BottomStack>` unifié (cookie + PWA + toasts) avec spacing auto | 7 | 6h | medium |
| R7 | `ZoomGuard` ne fight plus les modaux (flag global `isModalOpen`) | 6 | 2h | low |
| R8 | Fallback height sur `MountedOnly(Footer)` (anti-CLS) | 5 | 30m | low |
| R9 | Retirer `@import Fraunces` du Footer | 3 | 15m | low |

### P2 (V74+)

| # | Action | Gain UX | Effort | Risque |
|---|---|:---:|:---:|:---:|
| R10 | Bottom navigation mobile (annonces / messages / profil / favoris) | 9 | 1.5j | high |
| R11 | Split layout en `(public)/layout.tsx` vs `(authenticated)/layout.tsx` | 7 | 1j | high |
| R12 | SSR responsive via UA header (élimine flash desktop→mobile) | 6 | 4h | medium |
| R13 | Accessibility audit complet `role="banner"` / `<header>` / landmarks | 7 | 4h | low |
| R14 | Dédupe liens footer (col Informations vs footer-bar) | 2 | 30m | low |

---

## 4. Quick wins (effort < 1h chacun)

1. **`NAVBAR_HEIGHT = 72`** exporté depuis `lib/layout.ts` + remplacer 4 hardcodes (15 min) — R4.
2. **Fallback height Footer dans MountedOnly** : `<div style={{ height: 320 }} aria-hidden />` (10 min) — R8.
3. **Supprimer `@import` Fraunces dans Footer** : remplace `style[@import]` par `var(--font-fraunces)` (15 min) — R9.
4. **Restore `userScalable: true`** (5 min) + tester scroll-lock dezoom (45 min) — R3.
5. **Wrap `CookieBanner` dans `MountedOnly`** : élimine CLS (5 min) — Bug 2.11.

---

## 5. Refonte structurelle V73+

### 5.1 Split layout par segment (R11)

```
app/
  (public)/
    layout.tsx          → BetaBanner + Navbar simplifiée (auth CTAs) + Footer
    page.tsx            → home (RSC pure, à passer server)
    annonces/
    location/
  (authenticated)/
    layout.tsx          → AdminBar + Navbar enrichie (badges, RoleSwitchToggle)
                         + bottom-nav mobile + ToastStack + HeartbeatPing
    dossier/
    messages/
    proprietaire/
```

**Bénéfices** : `HeartbeatPing` ne ping plus les anonymes (économie /api/heartbeat), Navbar publique 50% plus légère, RSC home redevient possible (résout audit 01-seo P0 #4 home en `"use client"`).

### 5.2 Bottom navigation mobile (R10)

5 entrées : `Annonces / Favoris / Messages / Profil / Plus`. Pattern Airbnb/Leboncoin. Remplace le burger sur mobile pour les routes principales (le burger reste pour "Plus"). Hauteur 56 + safe-area-inset-bottom. z-index 9000 (sous modaux fullscreen).

**Effort** : 1.5j (composant + breakpoint logic + intégration dans `(authenticated)/layout.tsx`).

### 5.3 Stack unifié bottom (R6)

Composant `<BottomStack>` qui orchestre :
- Cookie banner (priorité 1, premier visit)
- PWA install (priorité 2, après 8s, mobile only)
- Sticky CTA fiche annonce (priorité 3, contextuel)
- Toasts (priorité 4, transient, max 3 stack)
- Pill cookie 🍪 (priorité 5, persistent)

Slot system unique → garantit aucune collision visuelle, espacement auto via flex column-reverse.

### 5.4 Source de vérité z-index (R1)

```ts
// lib/zIndex.ts
export const Z = {
  base: 0,
  card: 10,
  popover: 100,
  filters: 6000,
  stickyCTA: 8000,
  bottomBanners: 8500,
  navbar: 10000,
  drawer: 11000,
  modal: 11500,
  toast: 12000,
} as const
```

Refactor 30+ usages (mécanique mais désambigüise toute la hiérarchie). Élimine les bugs 2.1, 2.2, 2.4 d'un coup.

---

## Conclusion

Le layout KeyMatch est **fonctionnel mais fragile** : 13 mounts root, 7+ z-index échelons sans source de vérité, 3 banners bottom qui se croisent, 2 sticky tops qui se battent. Le commentaire user "le layout est vraiment nul" reflète surtout les bugs **2.1 (BetaBanner+AdminBar+Navbar empilés)**, **2.3 (banners bottom collision)**, **2.6 (scroll bloqué après pinch)** — tous P0/P1.

**Plan recommandé** : V72 = Quick wins (4h) + R1+R2+R3 (2j). V73 = R5-R9 (1j). V74+ = bottom-nav mobile + split layouts (3j).

Score layout actuel estimé : **5.5/10**. Cible post-V73 : **8.5/10**.
