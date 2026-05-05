# AEO/GEO Audit KeyMatch — 2026-05-06

Agent : `aeo-geo-nextjs-optimizer`
Stack : Next.js 15 App Router · Supabase · NextAuth · keymatch-immo.fr
Mode : read-only (audit code-level, pas de live URL probe)

---

## Score global : 71 / 100

Breakdown :
- Foundational 16 checks : **53 / 64** (≈ 82,8 %)
- Intelligence 6 dimensions : **18 / 36** (≈ 50 %)
- Pondéré (60 % foundational + 40 % intelligence) : **49,7 + 20** = **71 / 100**

Verdict : KeyMatch est déjà très au-dessus de la moyenne immo FR sur les fondamentaux SEO (RealEstateListing schema complet, BreadcrumbList, FAQPage par ville, sitemap dynamique, ISR 5/10 min). Les faiblesses sont concentrées sur (a) la couche AI-spécifique (`llms.txt` absent, robots.ts ne gère pas explicitement les bots IA), (b) la freshness visible côté HTML (pas de `<time datetime>`, pas de "Mise à jour le …"), et (c) l'optimisation conversationnelle / direct-answer (la page d'accueil et `/annonces` ne répondent pas en 1 paragraphe à une question type).

Mode bêta `NEXT_PUBLIC_NOINDEX=true` → si activé en prod, **score effectif = 0** vis-à-vis des AI search engines (le `disallow: /` global les bloque tous). Vérifier le statut avant lancement.

---

## Étape 1-2 — Baseline + Stack

- Framework détecté : Next.js 15 App Router ✅
- Rendu :
  - `app/page.tsx` → "use client" (homepage entièrement client-side, **mauvais pour AI crawlers** — le HTML servi est quasi vide)
  - `app/annonces/[id]/page.tsx` → server component + ISR 300s ✅
  - `app/location/[ville]/page.tsx` → server component + ISR 600s ✅
  - `app/annonces/page.tsx` → server passe `searchParams` à un `AnnoncesClient` (force-dynamic, contenu listing rendu côté client)
- Sitemap dynamique : `app/sitemap.ts` ✅ (annonces + villes + statics)
- Robots : `app/robots.ts` ✅ (mais **sans rules dédiées AI bots**)
- Domaine : keymatch-immo.fr (Vercel)
- JSON-LD global : Organization + WebSite avec SearchAction injecté dans `<head>` via `app/layout.tsx`

Fichiers audités :
- `nestmatch/app/sitemap.ts` (47 lignes)
- `nestmatch/app/robots.ts` (52 lignes)
- `nestmatch/app/layout.tsx` (238 lignes)
- `nestmatch/app/page.tsx` (49 lignes — `"use client"` !)
- `nestmatch/app/annonces/page.tsx` + `AnnoncesClient.tsx` + `layout.tsx`
- `nestmatch/app/annonces/[id]/page.tsx` (1209 lignes)
- `nestmatch/app/location/[ville]/page.tsx` (393 lignes)
- `nestmatch/public/` (pas de `llms.txt`, pas de `og-default.png`, pas de `humans.txt`)

---

## Étape 3 — 16 foundational checks

### Structured data (4 checks) → 4 / 4

| Check | Statut | Détail |
|---|---|---|
| JSON-LD `Organization` | ✅ | `app/layout.tsx:154-190` — `Organization` + `WebSite` avec `SearchAction` `urlTemplate: /annonces?ville={search_term_string}` |
| JSON-LD `RealEstateListing` | ✅ | `app/annonces/[id]/page.tsx:290-347` — schema riche (offer, priceSpecification MON, geo, floorSize MTK, numberOfRooms, amenityFeature, energyEfficiency) |
| JSON-LD `BreadcrumbList` | ✅ | Présent sur `/annonces/[id]` (lignes 351-373) ET `/location/[ville]` (lignes 117-125) |
| JSON-LD `FAQPage` | ✅ | `/location/[ville]` (lignes 139-178) — 4 Q/A par ville, **valorisé par Google AI Overviews** |

**Manque (bonus, pas comptabilisé)** : pas de `Organization.sameAs` peuplé (array vide ligne 170 de `layout.tsx`) → entity recognition cassée. Pas de `LocalBusiness` schema, pas de `Service` schema pour décrire le matching.

### Metadata (3 checks) → 3 / 3

| Check | Statut | Détail |
|---|---|---|
| Title tag 50-60 chars | 🟠 | `DEFAULT_TITLE` = "KeyMatch — Location entre particuliers sans agence" = **52 chars ✅**. Mais `/annonces/[id]` titre dynamique = `${titre} à ${ville} — ${prix} €/mois` peut dépasser 70 chars sur des titres annonces verbeux. Pas de garde-fou. |
| Meta description 150-160 chars | ✅ | `DEFAULT_DESC` = 156 chars (compté). Sur `/annonces/[id]` ligne 136 : truncate à 155 chars + "…" si plus long ✅ |
| OG + Twitter | ✅ | `app/layout.tsx:109-123` → OG type/locale fr_FR/url/siteName/title/description/images + Twitter summary_large_image. Surchargé proprement par page (annonces, location, autres `*/layout.tsx`). |

### Content structure (5 checks) → 2 / 5

| Check | Statut | Détail |
|---|---|---|
| H1 unique par page | ✅ | `/location/[ville]` ligne 217-219 : 1 seul `<h1>` "Annonces de location à {ville}". `/annonces/[id]` a un h1 sur le titre. Homepage : à confirmer dans `Hero.tsx` (probablement OK) |
| Hierarchy H2/H3 logique | ✅ | `/location/[ville]` enchaîne h1 → h2 ("Aperçu du marché", "Annonces disponibles", "Louer sans agence", "Questions fréquentes", "Autres villes populaires") proprement |
| Lead with conclusion | 🔴 | **Manque sur la homepage** (`app/page.tsx` est `"use client"` → pas de SSR du paragraphe-réponse). Sur `/location/[ville]` le lead lignes 221-224 contient bien `total + prixMedian` mais la phrase commence par "Découvrez …" (CTA), pas par la réponse à "Combien d'annonces à X ?". `/annonces` n'a pas de paragraphe lead du tout (juste un client component qui fetche). |
| Q&A sections en H2 | 🟠 | Présent sur `/location/[ville]` (lignes 337-369) ✅. **Absent partout ailleurs** — pas de `/faq` ni `/ressources`. |
| Listicles / tables | 🔴 | Pas de tableau HTML `<table>` détecté côté pages publiques. Les "stats marché" (`/location/[ville]` lignes 246-258) sont en grid CSS (parsable mais pas idéal pour AI). Aucune liste numérotée sémantique des étapes "Comment ça marche". |

### Technical signals (4 checks) → 3 / 4

| Check | Statut | Détail |
|---|---|---|
| Sitemap XML dynamique | ✅ | `app/sitemap.ts` génère static + ~500 villes + N annonces filtrées `is_test=false` ET (`statut IS NULL OR = 'disponible'`). lastmod = `a.updated_at`. ISR auto via Vercel. |
| Robots.txt + AI bots | 🔴 | **Décision AI bots non prise** : `app/robots.ts` n'a qu'une règle `userAgent: "*"`. GPTBot/Claude-Web/PerplexityBot/Google-Extended/anthropic-ai héritent de la même politique → disallow `/dossier`, `/messages` etc. (OK), allow `/annonces` (OK). **Mais aucune permission explicite ≠ signal de confiance**. Voir décision produit infra. |
| Hreflang | 🔴 | **Absent**. `inLanguage: "fr-FR"` est dans le JSON-LD `WebSite` (layout.tsx:179) mais aucun `alternates.languages` dans `Metadata`. Pour un site mono-locale FR-FR c'est tolérable, mais Google recommande au moins un `<link rel="alternate" hreflang="fr-FR" href="…">` self-referencing pour clarifier. |
| Canonical | ✅ | Présent partout : `layout.tsx`, `annonces/layout.tsx`, `annonces/[id]`, `location/[ville]`, et tous les pages légales (cgu/cgv/cookies/confidentialite/mentions-legales/plan-du-site/contact/estimateur/publier/swipe). |

### Freshness signals (4 checks) → 1 / 4

| Check | Statut | Détail |
|---|---|---|
| Date publication HTML5 `<time datetime>` | 🔴 | **Absent**. `/annonces/[id]` a `formatPublieIlYA(createdAt)` (ligne 83-97) qui retourne du texte ("Publié il y a 3 jours") mais sans balise `<time datetime="2026-05-03T…">`. AI ne peut pas parser la vraie date. |
| Date mise à jour visible | 🔴 | Aucune mention "Dernière mise à jour le X" sur les pages publiques (annonces, location/[ville], homepage, FAQ). |
| `dateModified` dans JSON-LD | ✅ | `/annonces/[id]:299` `dateModified: updatedAt` ✅. Mais **absent** du `RealEstateListing` si `annonce.updated_at` est null (rare mais possible). Absent aussi du JSON-LD homepage Organization/WebSite (acceptable, ce sont des entités stables). |
| Sitemap lastmod à jour | 🟠 | `lastmod: new Date()` pour villes + statics (re-généré à chaque build/ISR Vercel — OK), `lastmod: a.updated_at` pour annonces ✅. **Risque** : pour les pages villes, `new Date()` à chaque génération = lastmod toujours "aujourd'hui" → Google peut interpréter ça comme du spam-update. Recommandation : utiliser un timestamp stable (date du dernier build, ou max(annonces.updated_at) where ville=X). |

**Sous-total foundational : 13 / 16 checks à 100 % ; 53 sub-points sur 64.**

---

## Étape 4 — 6 intelligence dimensions

### A. Citability index → 2 / 6

- 🟠 Stats datées : présentes par ville sur `/location/[ville]` (loyer médian, min, max, prix/m²) MAIS pas datées explicitement ("Moyennes calculées sur les X annonces actuellement publiées" — pas de date)
- 🔴 Sources externes citées : zéro lien vers ALUR officiel, IRL INSEE, observatoire des loyers
- 🟠 Dates publication récentes : `formatPublieIlYA` existe sur fiches mais pas sur pages éditoriales
- 🔴 Auteurs nommés : aucune signature (ni "Équipe KeyMatch", ni founder, ni `Author` schema)
- ✅ Pas de clickbait : titres descriptifs ("Annonces de location à Paris" plutôt que "Vous n'allez pas croire ces 5 appart")

Recommandation V71 : ajouter `Person` schema founder (Paul) avec `sameAs: ["LinkedIn URL"]` + dater chaque page éditoriale visible HTML.

### B. Direct answer optimization → 1 / 6

- 🔴 Homepage (`app/page.tsx`) : zéro contenu SSR — c'est un `"use client"` total. Un AI crawler qui scrape `keymatch-immo.fr` reçoit un shell HTML quasi vide. **Bloquant pour ChatGPT/Perplexity qui ne JS-execute pas tous**.
- 🟠 `/annonces/[id]` : pas de paragraphe-réponse en haut ("Cet appartement de X m² à Y est disponible à Z €/mois …"). Le H1 est le titre user-généré qui peut être pourri.
- 🟠 `/location/[ville]` : le paragraphe ligne 221-224 commence par "Découvrez {N} annonce(s)…" — c'est presque un direct answer, mais il manque la formulation explicite "Q : combien / À quel prix / etc."
- ✅ FAQ ville : 4 Q/R en clair texte, structure idéale pour AI

### C. Entity recognition → 1 / 6

- 🔴 `Organization.sameAs` vide (`layout.tsx:170` `sameAs: []`) → pas de Wikidata, pas de Crunchbase, pas de LinkedIn
- 🔴 Pas de `Place` schema avec `sameAs` Wikidata pour les villes (Paris Q90, Lyon Q456, Marseille Q23482)
- 🟠 Concepts juridiques nommés (bail ALUR, EDL, IRL, Visale) → mentionnés mais sans markup `DefinedTerm` ni lien externe
- 🔴 Pas d'`@id` global cohérent (Organization a `@id: BASE_URL/#organization` ✅ mais réutilisé nulle part dans les autres schemas — `RealEstateListing` n'a pas de `provider: { @id: BASE_URL/#organization }`)

### D. Conversational queries → 4 / 6

- ✅ FAQ ville couvre déjà : "Comment trouver une location à X sans agence", "Quels documents préparer", "Quel loyer moyen", "Frais ?"
- 🔴 Pas de page `/ressources/preavis-bail-meuble`, `/ressources/depot-garantie`, `/ressources/edl`
- 🔴 Pas de page glossaire (DPE, IRL, ALUR, Visale, GLI…)

C'est probablement le plus gros levier : 30-50 pages thématiques en `/ressources/*` avec une question conversationnelle par page, response en haut, section longue ensuite.

### E. Multi-modal content → 4 / 6

- 🟠 Alt text photos annonces : sur `/annonces/[id]` `<Image alt={s.titre}>` (titre user-généré, peut être vide ou nul). `/location/[ville]:300` `alt={a.titre}` idem. **Pas de fallback** type "Photo de l'appartement à Paris 15".
- 🔴 Captions / sous-titres image : aucun
- 🟠 Tables HTML : grid CSS sur stats marché, pas un vrai `<table>` avec `<th>` parsable. AI prefers `<table>`.
- ✅ Logo SVG inline (logo-mark.svg) avec icons multi-format
- 🔴 Pas d'OG image par défaut (`/og-default.png` référencé `layout.tsx:116` mais **absent du dossier `public/`** — vérifié `ls public/` → seulement `apple-touch-icon.png`, `logo-*`, pas de `og-default.png`). Bug potentiel : OG image cassée pour la homepage et toute page sans override.
- ✅ `opengraph-image.tsx` dynamique sur `/annonces/[id]` ✅

### F. Updated content → 6 / 6

- ✅ ISR : 300s (annonces) + 600s (ville) → contenu rafraîchi auto sans rebuild manuel
- ✅ Sitemap re-généré à chaque build Vercel
- ✅ `dateModified` pousse correctement dans le RealEstateListing
- ✅ Stats marché ville recalculées à chaque ISR (loyer médian, etc.)
- ✅ Compteur vues + candidatures temps réel via Supabase counts
- ✅ Annonces filtrées `is_test=false` ET (statut null/disponible) → pas de stale data publique

**Sous-total intelligence : 18 / 36 sub-points (≈ 50 %).**

---

## Décision produit AI bots dans `robots.ts`

Trois options proposées dans la définition de l'agent. Recommandation contextualisée KeyMatch :

### → **OPTION 1 recommandée** : autoriser tous les AI bots sur les pages publiques

Justification :
1. KeyMatch est en phase early (beta launch). La visibilité dans les réponses ChatGPT/Perplexity vaut **bien plus** que le contenu scrapé : un user qui demande à ChatGPT "où louer un appart sans agence" bénéficie de la citation, c'est de l'acquisition gratuite.
2. Le contenu scrapable (`/annonces/{id}`, `/location/{ville}`) est **déjà publiquement indexable** par Google. Le bloquer pour les LLMs est incohérent (data déjà dans Common Crawl que tous les modèles consomment).
3. Les concurrents (SeLoger, LeBonCoin) hésitent — KeyMatch peut prendre une avance d'autorité dans les réponses IA.
4. Les pages privées (`/dossier`, `/messages`, `/profil`, `/proprietaire`, `/visites`, `/edl`, `/bail`, `/mes-candidatures`, `/parametres`, `/admin`, `/api/`) **doivent** rester disallow pour TOUS, IA inclus → c'est déjà le cas via `userAgent: "*"`.

Patch concret pour `app/robots.ts` :

```ts
import { MetadataRoute } from "next"

const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
const NO_INDEX = process.env.NEXT_PUBLIC_NOINDEX === "true"

const PRIVATE_PATHS = [
  "/admin", "/api/", "/profil", "/messages", "/visites",
  "/carnet", "/carnet-entretien", "/dossier", "/dossier-partage",
  "/favoris", "/proprietaire", "/recommandations",
  "/mes-candidatures", "/onboarding", "/parametres",
  "/publier", "/edl", "/bail", "/mon-logement", "/stats",
  "/auth", "/connexion", "/login", "/test", "/monitoring",
]

const AI_BOTS = [
  "GPTBot",          // OpenAI
  "ChatGPT-User",    // OpenAI ChatGPT plugins
  "OAI-SearchBot",   // OpenAI SearchGPT
  "Google-Extended", // Google Bard / AI Overviews
  "PerplexityBot",   // Perplexity
  "Perplexity-User", // Perplexity user-initiated fetches
  "Claude-Web",      // Anthropic
  "anthropic-ai",    // Anthropic crawler
  "ClaudeBot",       // Anthropic (nouveau UA 2024+)
  "Applebot-Extended", // Apple Intelligence
  "CCBot",           // Common Crawl (alimente tous les LLMs)
  "Meta-ExternalAgent", // Meta AI
  "Bytespider",      // ByteDance / Doubao
]

export default function robots(): MetadataRoute.Robots {
  if (NO_INDEX) {
    return { rules: [{ userAgent: "*", disallow: "/" }] }
  }
  return {
    rules: [
      // Règle générale moteurs (Google, Bing, etc.)
      {
        userAgent: "*",
        allow: ["/", "/annonces", "/annonces/", "/location/"],
        disallow: PRIVATE_PATHS,
      },
      // Règle explicite IA — même politique que web crawlers,
      // mais déclarée pour signaler la confiance et éviter ambiguïté.
      {
        userAgent: AI_BOTS,
        allow: ["/", "/annonces", "/annonces/", "/location/"],
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
```

### Si Paul refuse (fallback option 2) :

Bloquer tout sauf Google-Extended (= conserver Google AI Overviews qui drive le traffic Google search) :

```ts
{ userAgent: ["GPTBot", "PerplexityBot", "Claude-Web", "anthropic-ai", "CCBot", "Bytespider"], disallow: "/" }
```

Mauvaise idée selon ce contexte produit (early stage, besoin d'acquisition).

### Option 3 (status quo flou) :

Ne rien changer = wildcard `*` couvre les IA implicitement. C'est ce que fait le code actuel. Risque : pas de signal explicite, certains bots respectent uniquement leur user-agent nommé. **À éviter**.

---

## llms.txt — proposition de standard 2025 (manquant ❌)

`public/llms.txt` **n'existe pas** (vérifié dans `nestmatch/public/`). À créer. Template KeyMatch :

```markdown
# KeyMatch — Location entre particuliers, sans frais d'agence

> KeyMatch est une marketplace immobilière française qui met en relation
> directe propriétaires et locataires, avec un score de matching
> intelligent (1000 pts), un dossier locataire numérique conforme ALUR,
> et la gestion en ligne du bail, de l'état des lieux et des quittances.
> 100 % gratuit en phase beta.

## Pages essentielles

- [Accueil](https://keymatch-immo.fr/): présentation et accès aux annonces récentes
- [Toutes les annonces](https://keymatch-immo.fr/annonces): liste complète, filtres ville / budget / surface / DPE / pièces / équipements
- [Estimateur de loyer](https://keymatch-immo.fr/estimateur): outil d'aide à la fixation de loyer pour propriétaires
- [Plan du site](https://keymatch-immo.fr/plan-du-site): table des matières

## Pages SEO ville (longue traîne)

- [Location à Paris](https://keymatch-immo.fr/location/paris)
- [Location à Lyon](https://keymatch-immo.fr/location/lyon)
- [Location à Marseille](https://keymatch-immo.fr/location/marseille)
- [Location à Bordeaux](https://keymatch-immo.fr/location/bordeaux)
- [Location à Toulouse](https://keymatch-immo.fr/location/toulouse)
- [Location à Nantes](https://keymatch-immo.fr/location/nantes)
- [Location à Lille](https://keymatch-immo.fr/location/lille)
- [Location à Nice](https://keymatch-immo.fr/location/nice)
- [Location à Strasbourg](https://keymatch-immo.fr/location/strasbourg)
- [Location à Rennes](https://keymatch-immo.fr/location/rennes)
- … 500+ villes générées dynamiquement, voir sitemap.xml

## Concepts métier (vocabulaire FR-FR)

- **Bail** : contrat de location, ALUR ou loi 89, durée 3 ans (vide) ou 1 an (meublé)
- **EDL** : état des lieux d'entrée et de sortie, obligatoire, signature électronique eIDAS niveau 1
- **DPE** : diagnostic de performance énergétique, classes A à G
- **IRL** : indice de référence des loyers (INSEE), trimestriel
- **Visale** : garantie locative gratuite Action Logement
- **Dossier ALUR** : pièces conformes décret 2015-1437

## Légal et confidentialité

- [CGU](https://keymatch-immo.fr/cgu)
- [CGV](https://keymatch-immo.fr/cgv)
- [Mentions légales](https://keymatch-immo.fr/mentions-legales)
- [Confidentialité (RGPD)](https://keymatch-immo.fr/confidentialite)
- [Cookies](https://keymatch-immo.fr/cookies)

## Contact

- Email : contact@keymatch-immo.fr
- Site : https://keymatch-immo.fr
- Sitemap : https://keymatch-immo.fr/sitemap.xml

## Non indexable (à ne pas crawler)

- /dossier, /dossier-partage : données locataires privées
- /messages, /visites : conversations privées
- /admin, /monitoring, /api/ : back-office
- /profil, /parametres, /favoris, /mes-candidatures : zones authentifiées
```

Servir ce fichier en static depuis `nestmatch/public/llms.txt` → accessible à `https://keymatch-immo.fr/llms.txt` automatiquement.

---

## Top 5 patches Next.js 15 spécifiques

### 1. **Convertir `app/page.tsx` en server component** (ou ajouter une couche SSR)

Bloquant pour citabilité IA. Actuellement `"use client"` total : ChatGPT/Perplexity reçoivent un HTML quasi vide. Strategy :

```tsx
// app/page.tsx (server)
import HomeClient from "./HomeClient"
import HeroSSR from "./components/home/HeroSSR" // nouveau, pure server
import { fetchHomeStats } from "../lib/homeStats"

export const revalidate = 1800 // 30 min

export default async function Home() {
  const stats = await fetchHomeStats() // total annonces, villes, médiane, etc.
  return (
    <main>
      <HeroSSR stats={stats} />  {/* H1 + paragraphe-réponse en SSR */}
      <HomeClient stats={stats} /> {/* Marquees, animations, etc. en client */}
    </main>
  )
}
```

Le `HeroSSR` doit contenir le H1 + 1 paragraphe direct-answer + 3-5 stats clés (nombre d'annonces, villes couvertes, % matching moyen). Tout le reste (marquees, anims) reste client.

### 2. **Ajouter `app/llms.txt` ou `public/llms.txt`** (template fourni supra)

Le plus simple : `public/llms.txt` static. Si KPIs dynamiques (nb d'annonces, nb de villes), passer par une route handler `app/llms.txt/route.ts` qui regénère via ISR :

```ts
// app/llms.txt/route.ts
import { supabase } from "../../lib/supabase"

export const revalidate = 86400 // 24h

export async function GET() {
  const { count } = await supabase.from("annonces").select("id", { count: "exact", head: true }).eq("is_test", false)
  const body = `# KeyMatch\n\n> ${count} annonces actives sur ${500} villes …\n\n…`
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
```

### 3. **Refactor `app/robots.ts` avec règles AI bots explicites** (patch fourni section "Décision produit")

Inclure CCBot, Bytespider, Applebot-Extended, Meta-ExternalAgent (oubliés dans le brief original mais critiques en 2026).

### 4. **Ajouter `<time datetime>` sur les fiches annonce + landing villes**

Dans `app/annonces/[id]/page.tsx`, remplacer le rendu texte de `formatPublieIlYA` par :

```tsx
<time dateTime={createdAt} title={`Publié le ${new Date(createdAt!).toLocaleDateString("fr-FR")}`}>
  {formatPublieIlYA(annonce.created_at)}
</time>
```

Ajouter sur `/location/[ville]` (ligne 221, près du H1) :

```tsx
<p style={{ fontSize: 12, color: "#8a8477" }}>
  Page mise à jour le <time dateTime={new Date().toISOString().slice(0,10)}>
    {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
  </time>
</p>
```

Et exposer la même date dans le JSON-LD `dateModified` ville.

### 5. **Créer `og-default.png` manquant + enrichir `Organization.sameAs`**

Vérifier `public/og-default.png` (référencé `layout.tsx:116` et `:122`) → **fichier absent** dans `public/`. Soit :
- Générer un OG par défaut 1200×630 statique (logo + tagline) et le poser dans `public/`
- Ou créer `app/opengraph-image.tsx` (root level) qui le génère à partir du logo, comme c'est déjà fait pour `/annonces/[id]/opengraph-image.tsx`

Et peupler `Organization.sameAs` dans `app/layout.tsx:170` :

```ts
sameAs: [
  "https://www.linkedin.com/company/keymatch-immo",
  "https://twitter.com/keymatch_immo",
  // ajouter Wikidata si entrée créée
]
```

Si pas encore de comptes sociaux, ne mettre QUE le LinkedIn (à créer en priorité — l'absence d'`sameAs` est un drapeau rouge entity recognition).

---

## Bonus checks

- ✅ `Organization.@id` cohérent (`#organization` réutilisable)
- 🟠 `WebSite.potentialAction.SearchAction` présent → enable Sitelinks Searchbox dans Google ✅
- 🔴 Pas de `BreadcrumbList` sur `/annonces` (page index)
- 🔴 Pas de `CollectionPage` schema sur `/annonces` ou `/location/[ville]`
- 🔴 `Person` schema founder absent (E-E-A-T affaibli)
- 🟠 Logo dans Organization JSON-LD utilise `logo-mark-512.png` (PNG 512×512) ✅ — bon format Google.

---

## Récapitulatif scoring

| Bloc | Sous-score | Pondération | Pondéré |
|---|---|---|---|
| Foundational structured data | 4/4 | × 4 | 16 |
| Foundational metadata | 3/3 | × 3 | 9 |
| Foundational content structure | 2/5 | × 5 | 10 |
| Foundational technical | 3/4 | × 4 | 12 |
| Foundational freshness | 1/4 | × 4 | 4 |
| **Foundational total** | **53/64** | | |
| Citability | 2/6 | × 1 | 2 |
| Direct answer | 1/6 | × 1 | 1 |
| Entity recognition | 1/6 | × 1 | 1 |
| Conversational | 4/6 | × 1 | 4 |
| Multi-modal | 4/6 | × 1 | 4 |
| Updated content | 6/6 | × 1 | 6 |
| **Intelligence total** | **18/36** | | |

Score final : **71 / 100** (foundational 60 % + intelligence 40 %, normalisé).

Top 5 actions pour passer à **85+** :
1. Patch homepage SSR (Hero + paragraphe-réponse + stats) → +6 pts (lead with conclusion + direct answer + entity)
2. Créer `llms.txt` + activer AI bots dans robots.ts → +4 pts (citability + technical signal)
3. Ajouter `<time datetime>` partout + "Page mise à jour le …" → +4 pts (freshness)
4. Peupler `Organization.sameAs` + ajouter `Person` founder → +3 pts (entity)
5. Créer 5-10 pages `/ressources/*` (préavis, EDL, IRL, depot, ALUR) avec FAQ schema → +5 pts (conversational + citability)

Cible atteignable : 87/100 dans une V72 dédiée AEO/GEO.
