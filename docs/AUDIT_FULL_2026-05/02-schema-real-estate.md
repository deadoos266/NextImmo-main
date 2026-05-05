# Schema Audit — RealEstateListing — 2026-05-06

Audit JSON-LD Schema.org + Open Graph immobilier pour les pages annonces KeyMatch.

- Cible principale : `nestmatch/app/annonces/[id]/page.tsx`
- Listing : `nestmatch/app/annonces/page.tsx` + `nestmatch/app/annonces/layout.tsx`
- Helpers SEO : aucun (pas de `nestmatch/lib/seo*` — JSON-LD inline dans la page)
- Stack : Next 15 App Router, ISR `revalidate = 300`, génération SSR du `<script type="application/ld+json">` dans le `main`.

---

## Score : 21 / 30

| Section | Score | Notes |
|---|---|---|
| Required (10) | 8 / 10 | name OK, description OK, datePosted OK, image array OK, price + EUR OK. **Risques : `description` peut tomber sous 150 chars (fallback court), `name` non garanti 50-100 chars** |
| Address (5) | 4 / 5 | locality + country + postalCode + region + streetAddress (opt-in) tous présents avec garde conditionnelle. **MAIS `addressRegion` manquant en DB sur la majorité des annonces** |
| Geo (1) | 1 / 1 | latitude / longitude présents si lat/lng précis ou cityCoords fallback |
| Property characteristics (4) | 3 / 4 | areaSize présent **mais sous le mauvais nom (`floorSize` au lieu de `areaSize`)**, numberOfRooms OK, numberOfBedrooms OK conditionnel. **`floorLevel` manquant** alors qu'`annonce.etage` existe |
| Optional (4) | 1 / 4 | `additionalProperty` absent (utilise `amenityFeature` à la place), `tourBookingPage` absent, `availabilityStarts` absent (mais `validFrom` sur Offer), `leaseLength` absent |
| Open Graph immo (5) | 3 / 5 | og:type/title/description/url/image OK via Next Metadata. **Aucun tag `property:price:amount`, `property:bedrooms`, `property:area:size` — extension immo Facebook absente** |
| Hreflang (1) | 1 / 1 | `locale: "fr_FR"` dans openGraph. Pas de variantes (en/x-default) à ajouter en V71 si bilingue |

---

## Required (10) — 8/10

- ✅ `@type: "RealEstateListing"` (ligne 292) — bon choix vs Apartment/Residence
- ✅ `@id` + `url` canonique (lignes 293, 296)
- 🟠 `name: annonce.titre` (ligne 294) — **pas de garantie 50-100 chars**, dépend de la saisie proprio. Pas de truncate ni d'enrichissement (ville/prix) côté JSON-LD alors que `generateMetadata` enrichit pour le `<title>`
- 🟠 `description: annonce.description || \`${annonce.titre} à ${annonce.ville}\`` (ligne 295) — **fallback peut tomber sous 150 chars** (Google rich result requirement implicite). La meta description, elle, est tronquée à 155 chars + `…`
- ✅ `datePosted: createdAt` (ligne 298) ISO 8601 avec timezone (UTC `Z`) via `toISOString()`
- ✅ `dateModified: updatedAt` (ligne 299) — bonus
- 🟠 `image` (ligne 297) — **fallback à 1 seule URL** (`opengraph-image`) si pas de photos. Google recommande **min 3 images** pour rich results. Pas d'erreur de format mais qualité dégradée
- ✅ `price: annonce.prix` (ligne 319) — numeric depuis DB (pas une string `"1500€"`)
- ✅ `priceCurrency: "EUR"` (ligne 320)
- ✅ Bonus `priceSpecification.unitCode: "MON"` + `unitText: "Mois"` (lignes 322-327) — bien pour SERP loyer mensuel
- ✅ `availability` (ligne 328) — `InStock` / `PreOrder` selon `dispo`
- ✅ `priceValidUntil` (ligne 332) — calculé +90j

---

## Address (5) — 4/5

- ✅ `addressLocality: annonce.ville` (ligne 302)
- 🟠 `addressRegion: annonce.region || undefined` (ligne 303) — **champ `region` absent du formulaire publier sur la majorité des annonces**, donc undefined → omis. Pas un bug schema, mais opportunité SEO ratée
- 🟠 `postalCode: annonce.code_postal || undefined` (ligne 304) — conditionnel, pareil dépend saisie
- ✅ `addressCountry: "FR"` (ligne 305) — ISO 3166-1 alpha-2 correct
- ✅ `streetAddress` conditionné par `annonce.localisation_exacte` opt-in (ligne 306) — **bon réflexe RGPD**

---

## Geo (1) — 1/1

- ✅ `geo.latitude/longitude` (lignes 311-313)
- ✅ Stratégie en 3 cascades : lat/lng précis BAN → cityCoords statique → omis (lignes 277-281)
- 🟠 **Pas d'arrondi à 3 décimales** quand la géo est approximative (cityCoords retourne déjà arrondi, mais le check explicite manque). Risque mineur de fuite de localisation précise si proprio change `localisation_exacte` après coup

---

## Property characteristics (4) — 3/4

- 🔴 **`floorSize` au lieu de `areaSize`** (ligne 335). Schema.org `RealEstateListing` accepte `floorSize` (héritage `Place`) mais **Google Rich Results et la doc officielle préfèrent `areaSize` explicite**. Préférable d'émettre **les deux**, ou au minimum `floorSize` avec `unitCode: "MTK"` (qui est correct ici)
- ✅ `unitCode: "MTK"` correct (ligne 339)
- ✅ `numberOfRooms: annonce.pieces || undefined` (ligne 342)
- ✅ `numberOfBedrooms: annonce.chambres` conditionnel (ligne 343)
- 🔴 **`floorLevel` manquant** alors que la DB a `annonce.etage` et qu'un helper `formatEtage()` existe déjà ligne 56. Pertinent pour SERP immo (chips "RDC", "4e étage")

---

## Optional (4) — 1/4

- 🟠 **`additionalProperty` non utilisé** — la page utilise `amenityFeature` (`LocationFeatureSpecification`) ligne 268-274, ce qui est correct pour Place mais **Google immo recommande aussi `additionalProperty` (`PropertyValue`) pour DPE/GES**. Actuellement DPE est exposé via `energyEfficiencyScaleMin/Max` (ligne 346), ce qui est OK mais incomplet (pas de GES, pas de "année de construction", pas de "type de chauffage")
- 🔴 `tourBookingPage` absent — pourtant `<BookingVisite />` existe (ligne 13). Devrait pointer vers `${BASE_URL}/annonces/${id}#booking`
- 🟠 `availabilityStarts` absent (Offer a `validFrom: createdAt` qui est différent — c'est la date de publication, pas la date d'emménagement). Champ `annonce.dispo` ou `annonce.date_dispo` à brancher
- 🔴 `leaseLength` absent — pertinent meublé 12 mois min vs vide 36 mois (`{"@type": "QuantitativeValue", "minValue": annonce.meuble ? 12 : 36, "unitText": "MON"}`)

---

## Open Graph immobilier (5) — 3/5

- ✅ `og:type: website` (ligne 156) — note : `og:type: product` ou custom serait plus précis pour immo, mais `website` est acceptable
- ✅ `og:title`, `og:description`, `og:url`, `og:image` (lignes 158-163) tous gérés via Next Metadata
- ✅ `og:locale: fr_FR` (ligne 161) + `og:site_name: KeyMatch` (ligne 162)
- 🔴 **`property:price:amount` absent** — extension Facebook real estate non émise
- 🔴 **`property:price:currency`, `property:bedrooms`, `property:bathrooms`, `property:area:size`, `property:area:unit` tous absents** (grep `property:price` retourne 0 match dans tout `nestmatch/`)
- 🟡 Twitter `summary_large_image` OK (lignes 164-169)

---

## Hreflang (1) — 1/1

- ✅ `og:locale: "fr_FR"` (ligne 161) signal côté Open Graph
- 🟡 **Pas de `<link rel="alternate" hreflang="fr-FR" />`** explicite via `metadata.alternates.languages` (le fichier `nestmatch/app/annonces/[id]/page.tsx` ne l'émet pas, ni `app/layout.tsx`). Pour un site mono-langue ça reste correct, mais Google recommande de déclarer au moins `fr-FR` + `x-default` même mono-langue. À prévoir V71 si bilingue.

---

## Top 3 fixes prioritaires

### 1. 🔴 Ajouter Open Graph immo (property:price/bedrooms/area)

**Pourquoi** : Facebook + LinkedIn + plusieurs agrégateurs immo (Realtor.com-like) lisent ces tags pour générer un preview riche avec prix/m². Coût zéro, gain SEO/social mesurable.

**Où** : `nestmatch/app/annonces/[id]/page.tsx` lignes 151-170 (return de `generateMetadata`).

**Snippet** (Next 15 Metadata supporte `other` pour les tags non typés) :

```tsx
return {
  title,
  description,
  alternates: {
    canonical: pageUrl,
    languages: { "fr-FR": pageUrl, "x-default": pageUrl }, // V71-ready
  },
  openGraph: {
    type: "website",
    url: pageUrl,
    title,
    description,
    ...(ogImages ? { images: ogImages } : {}),
    locale: "fr_FR",
    siteName: "KeyMatch",
  },
  twitter: { /* … inchangé … */ },
  other: {
    "property:price:amount": String(annonce.prix ?? ""),
    "property:price:currency": "EUR",
    ...(annonce.chambres ? { "property:bedrooms": String(annonce.chambres) } : {}),
    ...(annonce.surface ? {
      "property:area:size": String(annonce.surface),
      "property:area:unit": "m2",
    } : {}),
  },
}
```

### 2. 🔴 Ajouter `floorLevel` + `areaSize` (en plus de `floorSize`) + `tourBookingPage`

**Pourquoi** :
- `floorLevel` existe en DB (`annonce.etage`) et le helper `formatEtage()` est déjà défini ligne 56 — cherry on top à coût ~0
- `areaSize` est l'alias officiellement recommandé par la doc Google Real Estate (vs `floorSize` qui vient de `Place`). Émettre les deux maximise la compatibilité
- `tourBookingPage` mappe directement le composant `<BookingVisite />` qui est déjà sur la page — déclare la fonctionnalité aux moteurs

**Où** : `nestmatch/app/annonces/[id]/page.tsx` lignes 335-347 (objet `jsonLd`).

**Snippet** :

```tsx
const surfaceQv = annonce.surface
  ? { "@type": "QuantitativeValue", value: annonce.surface, unitCode: "MTK" }
  : undefined

const jsonLd: Record<string, unknown> = {
  // … champs existants 290-334 …
  ...(surfaceQv ? { floorSize: surfaceQv, areaSize: surfaceQv } : {}),
  numberOfRooms: annonce.pieces || undefined,
  ...(annonce.chambres ? { numberOfBedrooms: annonce.chambres } : {}),
  ...(annonce.etage !== null && annonce.etage !== undefined && annonce.etage !== ""
    ? { floorLevel: formatEtage(annonce.etage) }
    : {}),
  tourBookingPage: `${BASE_URL}/annonces/${id}#booking`,
  ...(amenities.length > 0 ? { amenityFeature: amenities } : {}),
  // … reste inchangé …
}
```

### 3. 🟠 Garantir `description` ≥ 150 chars + `image` array ≥ 3 + `additionalProperty` DPE/GES

**Pourquoi** : Trois patches de qualité qui bloquent l'éligibilité Google Rich Results immo :
- description trop courte → preview SERP tronqué + perte du badge rich snippet
- image[] avec une seule URL → perte du carousel image dans Google Images
- DPE/GES en `additionalProperty` (`PropertyValue`) en plus d'`energyEfficiencyScaleMin/Max` → carrousel "détails du logement" plus riche

**Où** : `nestmatch/app/annonces/[id]/page.tsx` lignes 290-347.

**Snippet** :

```tsx
// 1. Description garantie ≥ 150 chars (fallback enrichi)
const fallbackDesc = `${annonce.titre || "Logement"} à ${annonce.ville || "louer"}` +
  ` — ${annonce.surface ?? "?"} m², ${annonce.pieces ?? "?"} pièces, ` +
  `${annonce.prix ?? "?"} €/mois charges comprises. ` +
  `Contactez directement le propriétaire sur KeyMatch, zéro frais d'agence.`
const descriptionLd = (annonce.description && annonce.description.length >= 150)
  ? annonce.description
  : (annonce.description ? `${annonce.description} ${fallbackDesc}` : fallbackDesc)

// 2. Image array ≥ 3 (complète avec og fallback si la DB n'a qu'une photo)
const ogFallback = `${BASE_URL}/annonces/${id}/opengraph-image`
const imagesLd = photos.length >= 3
  ? photos
  : photos.length > 0
    ? [...photos, ogFallback, `${BASE_URL}/og-default.png`].slice(0, 3)
    : [ogFallback]

// 3. additionalProperty pour DPE/GES + équipements (en plus d'amenityFeature)
const additionalProperty: Array<Record<string, unknown>> = []
if (annonce.dpe) additionalProperty.push({ "@type": "PropertyValue", name: "DPE", value: annonce.dpe })
if (annonce.ges) additionalProperty.push({ "@type": "PropertyValue", name: "GES", value: annonce.ges })
if (typeof annonce.meuble === "boolean") additionalProperty.push({ "@type": "PropertyValue", name: "Meublé", value: annonce.meuble })
if (annonce.annee_construction) additionalProperty.push({ "@type": "PropertyValue", name: "Année construction", value: annonce.annee_construction })

const jsonLd: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "RealEstateListing",
  // …
  description: descriptionLd,
  image: imagesLd,
  // …
  ...(additionalProperty.length > 0 ? { additionalProperty } : {}),
}
```

---

## Annexe — Couverture technique

- JSON-LD émis ligne 377-388 (`<script type="application/ld+json">` x2 : RealEstateListing + BreadcrumbList) — **bon pattern** : double script, `replace(/</g, "\\u003c")` anti-XSS appliqué
- BreadcrumbList correctement formé avec maillage vers `/location/[ville]` (lignes 351-373) — rien à corriger
- ISR `revalidate = 300` (ligne 36) → cohérent avec un crawl Google plusieurs fois par jour
- `is_test: true` court-circuite `generateMetadata` ET le rendu (lignes 124, 219) → bonne hygiène SEO (pas de pollution des SERP par des annonces de test)
- Pas de `nestmatch/lib/seo/*` partagé — la logique est dupliquable si V71 ajoute d'autres pages immo (`/location/[ville]`, futurs `/proprietaire/biens/[id]/public`). Recommander un helper `lib/seo/realEstateJsonLd.ts` quand le besoin de réutilisation apparaîtra

## Outils de validation à passer après fix

- https://validator.schema.org/ (paste source HTML rendu de `/annonces/{id}`)
- https://search.google.com/test/rich-results (Rich Results Test, prendre une URL prod réelle)
- https://developers.facebook.com/tools/debug/ (pour vérifier les `property:*` après fix #1)
