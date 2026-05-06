# Plan V75 — Split layouts public / authenticated

**Statut** : ⏳ DEFER V75 (refacto trop large pour 1 commit unique fiable).

V74.2 a été sciemment deferred pour ne pas casser le rendu en live pendant
la session V74. Ce document capture le plan complet pour exécution V75.

---

## Pourquoi splitter ?

Audit V72.5 — état actuel (1 layout root unique) :
- Mêmes Navbar / AdminBar / BetaBanner / CookieBanner / Footer / BottomNav
  rendus pour les 80+ pages, qu'elles soient publiques (`/`, `/cgu`,
  `/status`) ou authentifiées (`/profil`, `/admin`, `/messages`).
- Beaucoup de logique conditionnelle dans Navbar (variant compact mobile,
  is-admin, is-thread-active) qu'un split layouts éliminerait.
- Pas de sidebar dédiée pour l'espace authentifié (toujours une nav top).
- Pas de full-bleed hero pour les pages publiques (Navbar prend 72px).

## Cible Next.js 15 App Router avec route groups

```
app/
├── layout.tsx                    # racine globale (analytics, providers,
│                                 #   error boundary, cookie, toast)
├── (public)/
│   ├── layout.tsx                # header simplifié + footer marketing
│   ├── page.tsx                  # home (déplacé depuis app/page.tsx)
│   ├── connexion/
│   ├── auth/
│   ├── annonces/                 # listing public (lecture)
│   ├── location/[ville]/
│   ├── cgu/
│   ├── cgv/
│   ├── mentions-legales/
│   ├── politique-confidentialite/  → si dossier renommé depuis confidentialite
│   ├── confidentialite/
│   ├── cookies/
│   ├── status/                   # /status publique (V71.5)
│   ├── plan-du-site/
│   ├── contact/
│   ├── estimateur/
│   └── proprietaire/             # landing publique proprio
├── (authenticated)/
│   ├── layout.tsx                # TopChrome + bottom nav mobile
│   ├── profil/
│   ├── dossier/
│   ├── dossier-partage/
│   ├── messages/
│   ├── recherches-sauvegardees/
│   ├── mon-logement/
│   ├── mes-candidatures/
│   ├── mes-quittances/
│   ├── mes-documents/
│   ├── carnet/
│   ├── carnet-entretien/
│   ├── visites/                  # si existe
│   ├── parametres/
│   ├── favoris/
│   ├── onboarding/
│   ├── bail-invitation/
│   ├── edl/
│   ├── proprietaire/ajouter/    # création annonce (auth)
│   ├── proprietaire/bail/
│   ├── proprietaire/baux/
│   ├── proprietaire/dashboard/  # si distinct de /proprietaire landing
│   ├── proprietaire/edl/
│   ├── proprietaire/visites/
│   ├── proprietaire/loyers/
│   ├── proprietaire/...
│   └── admin/
│       ├── layout.tsx            # admin guard (existant déjà)
│       ├── page.tsx
│       ├── health/
│       └── ...
└── api/                          # (inchangé)
```

⚠️ Subtilité : `app/(public)/proprietaire/` (landing publique CTA inscription)
vs `app/(authenticated)/proprietaire/ajouter` etc. Les 2 chemins URL ne
peuvent pas coexister en route groups si la racine `/proprietaire` est
ambiguë. Solutions :
- A) Renommer la landing publique en `/proprietaires` (pluriel, ou autre URL)
- B) Garder `/proprietaire` au layout root et ne splitter que les autres routes

## Étapes d'exécution

### Étape 1 — Créer les 2 layouts (commit indépendant, pas de move)
- `app/(public)/layout.tsx` — header simplifié + footer marketing
- `app/(authenticated)/layout.tsx` — TopChrome + bottom nav mobile + footer minimal

### Étape 2 — Move des routes publiques (1 commit par batch)
Batch 2a : pages légales statiques (faible risque)
- `app/cgu/` → `app/(public)/cgu/`
- `app/cgv/` → `app/(public)/cgv/`
- `app/mentions-legales/` → `app/(public)/mentions-legales/`
- `app/confidentialite/` → `app/(public)/confidentialite/`
- `app/cookies/` → `app/(public)/cookies/`
- `app/plan-du-site/` → `app/(public)/plan-du-site/`
- `app/status/` → `app/(public)/status/`

Batch 2b : pages auth (faible risque)
- `app/auth/` → `app/(public)/auth/`
- `app/connexion/` → `app/(public)/connexion/`
- `app/login/` → `app/(public)/login/` (si distinct)

Batch 2c : home + listing public
- `app/page.tsx` → `app/(public)/page.tsx`
- `app/annonces/` → `app/(public)/annonces/` (la page listing est publique
  même pour des users connectés)
- `app/location/` → `app/(public)/location/`
- `app/contact/` → `app/(public)/contact/`
- `app/estimateur/` → `app/(public)/estimateur/`

### Étape 3 — Move des routes authenticated (1 commit par batch)
Batch 3a : profil + dossier
- `app/profil/` → `app/(authenticated)/profil/`
- `app/dossier/` → `app/(authenticated)/dossier/`
- `app/dossier-partage/` → `app/(authenticated)/dossier-partage/`
- `app/parametres/` → `app/(authenticated)/parametres/`

Batch 3b : messages + favoris + recherches + mes-*
- `app/messages/` → `app/(authenticated)/messages/`
- `app/favoris/` → `app/(authenticated)/favoris/`
- `app/recherches-sauvegardees/` → `app/(authenticated)/recherches-sauvegardees/`
- `app/mes-candidatures/` → `app/(authenticated)/mes-candidatures/`
- `app/mes-quittances/` → `app/(authenticated)/mes-quittances/`
- `app/mes-documents/` → `app/(authenticated)/mes-documents/`
- `app/mon-logement/` → `app/(authenticated)/mon-logement/`
- `app/onboarding/` → `app/(authenticated)/onboarding/`

Batch 3c : carnet + edl + bail-invitation + anciens-logements
- `app/carnet/` → `app/(authenticated)/carnet/`
- `app/carnet-entretien/` → `app/(authenticated)/carnet-entretien/`
- `app/anciens-logements/` → `app/(authenticated)/anciens-logements/`
- `app/edl/` → `app/(authenticated)/edl/`
- `app/bail-invitation/` → `app/(authenticated)/bail-invitation/`

Batch 3d : proprietaire (gros, à splitter)
- `app/proprietaire/` → `app/(authenticated)/proprietaire/` ou solution B
  ci-dessus selon la décision URL.

Batch 3e : admin
- `app/admin/` → `app/(authenticated)/admin/`

### Étape 4 — Vérifications
- Tester chaque URL : pas de 404
- Tester les redirects internes (Link href="/messages") : doit pointer
  vers le route group sans changer l'URL
- Tester les sitemap.ts / robots.ts : URLs inchangées
- Vérifier les références `<Link href="/...">` dans le code : aucune ne
  doit casser
- Lighthouse mobile : 80+ sur les pages publiques, 70+ sur authenticated

## Risques et mitigations

| Risque | Mitigation |
|--------|------------|
| Cassure d'URL après move | Route groups invisibles, l'URL reste la même |
| Hydration mismatch nouveau layout | Reproduire les MountedOnly wrappers dans (authenticated)/layout.tsx |
| BottomNav perdue sur public | Wantingly hide sur (public)/layout.tsx (pas de mount) |
| `/proprietaire` URL conflict | Décision A ou B avant Étape 3d |
| Imports relatifs cassés | Ajuster `../` selon profondeur dans le route group |
| Sub-layouts admin existants | `app/(authenticated)/admin/layout.tsx` héritera du layout authenticated |

## Effort estimé

- Étape 1 : 2 h (création 2 layouts + tests visuels)
- Étape 2 : 3 h (3 batches × 1 h)
- Étape 3 : 5 h (5 batches × 1 h)
- Étape 4 : 2 h (vérifications + fix bugs résiduels)

**Total : ~12 h sur 1-2 jours.**

## Score attendu post-V75

V72.5 audit layout disait 5.5/10. V73 a montré 7.4/10. V74 stay around 7.6/10
(TopChrome + Z_INDEX modaux mais split layouts deferred). V75 cible **8.5/10**
quand les 2 layouts sont en place.

## Backlog post-split (V76+)

Une fois le split fait, ces refacto deviennent triviaux :
- Sidebar dédiée espace authenticated desktop (lieu de la mainbar fluide)
- Hero full-bleed sur la home (sans Navbar 72px qui pousse)
- Navigation breadcrumb seulement dans (authenticated)
- Footer marketing différent du footer minimal
- Analytics distinctes (public = funnel acquisition, auth = retention)
