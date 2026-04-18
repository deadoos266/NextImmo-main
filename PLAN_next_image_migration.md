# PLAN — Migration `<img>` → `next/image` sur pages publiques

## 1. Contexte et objectif
~15 fichiers utilisent `<img src="...">` plain. Pas de lazy loading natif, pas de `srcset` responsive, pas de format moderne (AVIF/WebP). Impact Core Web Vitals : LCP dégradé, data gaspillée mobile. Migrer vers `next/image` sur les pages publiques critiques (home, annonces, fiche, villes, favoris) pour optimisation auto.

## 2. Audit de l'existant

### `<img>` à migrer (pages publiques prioritaires)

```
app/annonces/[id]/page.tsx                → photos similaires en grille
app/annonces/[id]/PhotoCarousel.tsx       → photo principale annonce + lightbox
app/annonces/page.tsx (CardPhoto)         → carousel photos cards
app/favoris/page.tsx                      → probablement photos
app/location/[ville]/page.tsx             → photos vitrines
app/page.tsx                              → photos hero home si présentes
```

### `<img>` à garder (mobile / data URLs / SVG inline)
```
app/components/Logo.tsx                   → utilise <img src="/logo-mark.svg"> → OK en next/image mais SVG petit, facultatif
app/dossier/page.tsx uploaded files       → sources Supabase Storage, peut rester <img>
app/parametres/OngletProfil.tsx          → avatar 84×84, peut migrer
app/messages/page.tsx avatar              → idem, migre en option
app/components/Navbar.tsx                 → avatar 40/48px, migre en option
```

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `app/annonces/[id]/PhotoCarousel.tsx` | MODIF | `<img>` → `<Image />` avec `fill`, `sizes`. |
| `app/annonces/[id]/page.tsx` | MODIF | Grille similaires `<Image />`. |
| `app/annonces/page.tsx` (CardPhoto) | MODIF | Photos cards `<Image />`. |
| `app/favoris/page.tsx` | MODIF | Photos favoris `<Image />`. |
| `app/location/[ville]/page.tsx` | MODIF | Photos vitrines `<Image />`. |
| `app/page.tsx` (home) | MODIF si photos présentes | `<Image />` avec priorité pour hero. |
| `next.config.js` | MODIF | `images.remotePatterns` pour autoriser Supabase Storage. |

## 4. Migrations SQL
**Aucune**.

## 5. Variables d'env
**Aucune**.

## 6. Dépendances
**Aucune** (next/image déjà dans Next.js).

## 7. Étapes numérotées

### Bloc A — Config remotePatterns
1. Ouvrir `next.config.js`. Ajouter dans `nextConfig` :
    ```js
    images: {
      remotePatterns: [
        {
          protocol: "https",
          hostname: "*.supabase.co",
          pathname: "/storage/v1/object/public/**",
        },
      ],
      formats: ["image/avif", "image/webp"],
      deviceSizes: [320, 480, 640, 768, 1024, 1280, 1536],
      imageSizes: [48, 64, 96, 128, 256, 384],
    },
    ```
2. Vérifier l'URL exacte Supabase (prod + staging si relevant). Si multi-region, ajouter plusieurs patterns.

### Bloc B — PhotoCarousel.tsx
3. Ouvrir `app/annonces/[id]/PhotoCarousel.tsx`.
4. Imports :
    ```tsx
    import Image from "next/image"
    ```
5. Remplacer dans la section principale :
    ```tsx
    <img
      src={photos[idx]}
      alt={`Photo ${idx + 1}`}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
    ```
    par :
    ```tsx
    <Image
      src={photos[idx]}
      alt={`Photo ${idx + 1}`}
      fill
      priority={idx === 0}
      sizes="(max-width: 768px) 100vw, 800px"
      style={{ objectFit: "cover" }}
    />
    ```
    Le parent doit être `position: relative` (déjà `position: "relative"` dans la div enveloppante → OK).
6. Pour l'image du lightbox fullscreen : l'image doit rester non-optimisée car zoomable. Garder `<img>` OU ajouter `unoptimized` sur `<Image>` :
    ```tsx
    <Image src={photos[idx]} alt="" width={0} height={0} sizes="100vw" style={{ width: "auto", height: "auto", maxWidth: "94vw", maxHeight: "88vh" }} unoptimized />
    ```

### Bloc C — CardPhoto (annonces list)
7. Ouvrir `app/annonces/page.tsx`, composant `CardPhoto`. Remplacer :
    ```tsx
    <img src={currentPhoto} alt={annonce.titre} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    ```
    par :
    ```tsx
    <Image
      src={currentPhoto}
      alt={annonce.titre}
      fill
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
      style={{ objectFit: "cover" }}
    />
    ```
8. Tester avec une liste de 10+ annonces : lazy loading natif doit kick in.

### Bloc D — Similaires fiche annonce
9. `app/annonces/[id]/page.tsx`, section "Autres biens similaires". Les cards utilisent background-image CSS :
    ```tsx
    <div style={{ backgroundImage: firstPhoto ? `url(${firstPhoto})` : undefined, ... }} />
    ```
    → Remplacer par `<Image fill>` dans une div relative.

### Bloc E — Favoris / Villes
10. `app/favoris/page.tsx` : migrer toute image annonce → `<Image fill>`.
11. `app/location/[ville]/page.tsx` : idem.

### Bloc F — Home
12. `app/page.tsx` : si hero image présente, `<Image priority>`. Si pas d'image hero, skip.
13. Si images "section features" : `<Image />` standard.

### Bloc G — Avatars (optionnel)
14. Les avatars 40-48px peuvent rester `<img>` pour simplicité (ratio bénéfice/effort faible). Skip sauf si tout le monde insiste.

### Bloc H — Tests visuels
15. `npm run build && npm run start`
16. Ouvrir Chrome DevTools → Lighthouse → audit Performance.
17. Vérifier :
    - LCP < 2.5 s
    - CLS < 0.1
    - Speed Index < 3 s
18. Network tab : images servies en `.webp` ou `.avif` (vérifier Content-Type).

### Bloc I — Fallback erreur image
19. Pour les URLs Supabase qui peuvent 404 (annonce supprimée mais photo restée dans un cache quelque part), gérer `onError` :
    ```tsx
    <Image onError={e => { e.currentTarget.style.display = "none" }} />
    ```
    Pattern alternatif : state `imgOk`.

## 8. Pièges connus

- **`fill` nécessite parent `position: relative`** : souvent déjà le cas sur les cards, mais à vérifier. Sinon l'image sort du flow.
- **`sizes` obligatoire avec `fill`** : si omis, Next sert une image taille max (waste). Toujours spécifier.
- **URLs Supabase avec `?v=<timestamp>`** pour cache bust (ex : avatar custom) : `next/image` re-fetch à chaque nouveau timestamp. OK.
- **Limite free Vercel** : optimisation images gratuite jusqu'à 1000/mois sur Hobby. Au-delà, Vercel Pro (20 $/mois) ou désactivation via `unoptimized`. Vérifier volume attendu.
- **`priority`** : à utiliser UNIQUEMENT pour l'image LCP principale (hero). Trop de `priority` = défaite de l'intérêt.
- **Domaines Supabase CDN** : `remotePatterns` doit couvrir. Un 404 silencieux se traduit par image cassée.
- **`alt` jamais vide** : accessibilité. Si décoratif pur, `alt=""`.
- **Photo principale vs vignettes** : grid similaires sur fiche = vignettes 240×140 → `sizes="240px"` sufit. Pas besoin de sizes élaboré.
- **Background-image CSS** ne peut pas utiliser `next/image`. Si on veut optimiser, refacto en div relative + `<Image fill>`. Compromis esthétique si l'effet gradient/opacity était posé en CSS.

## 9. Checklist "c'est fini"

- [ ] `next.config.js` contient `remotePatterns` Supabase.
- [ ] `PhotoCarousel` migré.
- [ ] `CardPhoto` (liste annonces) migré.
- [ ] Grille similaires fiche annonce migrée.
- [ ] `/favoris` migré.
- [ ] `/location/[ville]` migré.
- [ ] Home migrée si photos hero.
- [ ] Lighthouse `/` : LCP < 2.5 s, Performance score > 85.
- [ ] Network tab : images servies en .webp / .avif.
- [ ] Aucune image 404 / cassée après migration.
- [ ] `tsc --noEmit` OK, `npm run build` OK.

---

**Plan prêt, OK pour Sonnet.** Aucun bloc ⚠️ Opus-only : migration mécanique.
