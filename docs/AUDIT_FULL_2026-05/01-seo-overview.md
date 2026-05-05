# SEO Audit KeyMatch — 2026-05-06

**Phase** : V70 beta gratuite (NEXT_PUBLIC_NOINDEX peut être actif → audit lit le code, pas le live)
**Domaine** : keymatch-immo.fr
**Stack** : Next.js 15 App Router · Supabase · inline styles · DM Sans + Fraunces
**Auditeur** : `seo-agency-orchestrator`
**Mode** : read-only (aucune modification de code)

---

## Score global : 72/100

KeyMatch a déjà un socle SEO **très au-dessus de la moyenne** d'un MVP immo : sitemap dynamique multi-source, robots.txt avec NO_INDEX flag bêta propre, JSON-LD `RealEstateListing` complet (offers + geo + amenityFeature + petsAllowed + DPE), `BreadcrumbList`, `FAQPage` + `ItemList` sur les pages villes, ISR bien réglé (300s annonces / 600s villes), Organization + WebSite + SearchAction injectés une seule fois dans `layout.tsx`. Les grosses pertes de points viennent de **3 trous structurels** : pas de `generateMetadata` sur `/` et `/annonces` (titre/description tirés du default layout uniquement), pas de `LocalBusiness`/`Place` schema, et absence de fichiers GEO/AEO (`llms.txt`, FAQ home, signaux de fraîcheur).

| Dimension | Score | Note |
|-----------|------:|------|
| 1. Tech SEO Next.js | 16/20 | Très solide, manque metadata sur 2 pages clés + OG image par défaut absente du `/public` |
| 2. Content / Keywords FR | 11/20 | Page ville templatisée bien structurée mais contenu identique entre villes (duplicate content léger) |
| 3. Local / Maps | 9/20 | GeoCoordinates injecté, mais pas de `LocalBusiness` proprio, pas de NAP cohérent |
| 4. Schema.org | 17/20 | Excellent : RealEstateListing + Breadcrumb + Organization + WebSite + FAQ + ItemList |
| 5. GEO / AEO | 9/20 | Pas de `llms.txt`, pas de direct answer en H1+lead, pas de "dernière mise à jour" visible |
| 6. Backlinks (recommandations only) | 10/20 | N/A côté code — feuille de route à dérouler côté biz |

---

## 1. Tech SEO Next.js — 16/20

### Acquis (vert)
- 🟢 **`app/sitemap.ts`** dynamique : annonces filtrées (`statut disponible` ou null, `is_test=false`) + ~150 pages villes via `CITY_NAMES` + 10 statiques. Priorities cohérentes (1.0 home, 0.9 /annonces, 0.7 villes, 0.6 fiches). `changeFrequency` propre.
- 🟢 **`app/robots.ts`** : disallow exhaustif (admin, api, profil, messages, dossier privé, auth, etc.) + sitemap déclaré. Flag `NEXT_PUBLIC_NOINDEX` qui bascule en `disallow: /` global pour la bêta — pattern propre, à désactiver à V71.
- 🟢 **ISR** : `revalidate = 300` sur `/annonces/[id]`, `revalidate = 600` sur `/location/[ville]`. Bon compromis cache vs fraîcheur.
- 🟢 **`generateMetadata`** sur `/annonces/[id]` (titre dynamique avec ville/prix/surface, description tronquée à 155 char, canonical, OG, Twitter card).
- 🟢 **`generateMetadata`** sur `/location/[ville]` (titre + canonical + OG).
- 🟢 **`opengraph-image.tsx`** dynamiques pour `/annonces/[id]` et `/location/[ville]` — fallback Next OG quand l'annonce n'a pas de photo.
- 🟢 **`metadataBase`** défini, `alternates.canonical` cohérent.
- 🟢 **DM Sans + Fraunces** via `next/font/google` avec `display: swap` → pas de FOIT.

### Issues
- 🔴 **`/` (home) est `"use client"`** : aucune `generateMetadata` propre. Tombe sur le default du layout (`"KeyMatch — Location entre particuliers sans agence"`). C'est la page la plus importante du site. **Effort S** : extraire la home en server component qui rend `<HomeClient />` ou exporter une `metadata` static export.
- 🔴 **`/annonces` (page liste)** : pas de `generateMetadata`. Avec `force-dynamic`, les filtres `?ville=Paris` ne génèrent ni titre ni description spécifiques → loupé énorme côté longue traîne. **Effort M**.
- 🟠 **`/og-default.png` référencé dans `layout.tsx` mais absent de `/public`** (vérifié par `ls public`). Twitter/Facebook/LinkedIn vont retourner une 404 sur le partage de la home. **Effort S**, juste générer le fichier.
- 🟠 **Pas de `hreflang`** déclaré. OK pour V70 mono-FR mais à ajouter dès qu'i18n EN arrive (V71+).
- 🟠 **Core Web Vitals non auditables côté code** : nécessite Lighthouse + PageSpeed Insights en prod. À planifier post-désactivation `NO_INDEX`.
- 🟠 **`<img>` non-`next/image`** dans 10 fichiers (cf grep) — la majorité sont en zone privée (proprio/edl/messages), donc OK pour le SEO direct, mais `app/components/MapAnnonces.tsx` et `app/components/Navbar.tsx` méritent vérif.

---

## 2. Content / Keywords FR — 11/20

### Acquis
- 🟢 Page `/location/[ville]` bien structurée : H1 spécifique ville, paragraphe intro avec count + médian, stats marché (loyer médian/min/max, surface moyenne, €/m², répartition T1-T5), grille annonces, contenu éditorial 3 paragraphes, FAQ 4 Q/R, maillage interne 14 autres villes.
- 🟢 Long-tail `Location {ville}` × ~150 villes = ~150 landing pages générées.
- 🟢 Mots-clés natifs cohérents : "sans frais d'agence", "matching", "dossier ALUR", "messagerie directe".

### Issues
- 🔴 **Duplicate content / "thin content" sur les villes vides** : si une ville a 0 annonce, la page reste indexée avec uniquement le contenu éditorial générique → Google peut la voir comme `soft 404` ou doorway. **Effort S** : ajouter `noindex` dynamique si `total === 0`, OU exclure du sitemap.
- 🔴 **Contenu éditorial 100% identique entre villes** (sauf nom). Aucun différenciateur quartiers/transports/prix moyens du marché externe. Risque modéré de Google Panda. **Effort L** : enrichir avec data quartier (cf agent `location-page-generator-fr` du seo-agency-orchestrator).
- 🟠 **Aucun blog / contenu top-of-funnel** : pas de page `/guide-location-paris`, `/dpe-f-interdiction-2028`, `/bail-meuble-etudiant`. Manque toute la stratégie de capture sur recherches informationnelles. **Effort L**.
- 🟠 **Keywords meta** dans `layout.tsx` génériques : "location appartement, location particulier, sans agence, logement, louer appartement, matching locataire" — Google les ignore depuis 2009 mais Bing les utilise encore légèrement.
- 🟠 **Aucune page de typologie** : pas de `/studios-paris`, `/t3-lyon`, `/colocation-{ville}`, `/meuble-{ville}`. C'est exactement la longue traîne haute conversion.

---

## 3. Local / Maps SEO — 9/20

### Acquis
- 🟢 `GeoCoordinates` injecté dans `RealEstateListing` (lat/lng précis si dispo, sinon centre ville via `cityCoords.ts`).
- 🟢 `PostalAddress` structurée (`addressLocality`, `addressRegion`, `postalCode`, `addressCountry: FR`, `streetAddress` si `localisation_exacte`).

### Issues
- 🔴 **Pas de schema `LocalBusiness` ou `Place`** sur la page proprio publique (si elle existe). Pour les bailleurs pros (carte Hoguet), ça coupe l'éligibilité au panneau Knowledge Graph. **Effort M**.
- 🔴 **Pas de Google Business Profile** mentionné nulle part. Pour KeyMatch en tant qu'entreprise, GBP avec adresse postale FR + photos + horaires + posts hebdo = signal local fort. **Effort M, hors code**.
- 🟠 **NAP non auditable** : Name OK (`BRAND.name`), Address absente (pas d'adresse postale dans `lib/brand.ts`), Phone absent. Pour `Organization` schema, ajouter `address` + `telephone` augmente la confiance E-E-A-T. **Effort S**.
- 🟠 **Pas de citations annuaires immo FR** (Pages Jaunes, Yelp FR, Bonjour France) — recommandation hors code.

---

## 4. Schema.org — 17/20

### Acquis (excellent travail)
- 🟢 `RealEstateListing` avec `@id`, `name`, `description`, `url`, `image[]`, `datePosted`, `dateModified`, `address`, `geo`, `offers` (avec `priceSpecification` `unitCode: MON`, `availability InStock/PreOrder`, `priceValidUntil` à +90j), `floorSize` (m²), `numberOfRooms`, `numberOfBedrooms`, `amenityFeature[]` (LocationFeatureSpecification), `petsAllowed`, `energyEfficiencyScaleMin/Max` (DPE).
- 🟢 `BreadcrumbList` sur `/annonces/[id]` (Accueil → Annonces → Location {ville} → Titre) — visible JSON + visible UX.
- 🟢 `BreadcrumbList` + `ItemList` + `FAQPage` (4 Q/R) sur `/location/[ville]`.
- 🟢 `Organization` + `WebSite` + `SearchAction` (`urlTemplate: /annonces?ville={search_term_string}`) injectés une seule fois dans `layout.tsx` head — clean.
- 🟢 Échappement XSS `replace(/</g, "\\u003c")` sur tous les JSON-LD — sécurisé.

### Issues
- 🟠 **`Organization.address` et `telephone` manquants** → opportunité Knowledge Panel ratée.
- 🟠 **`Organization.sameAs: []` vide** → ajouter LinkedIn KeyMatch, Twitter, Instagram, Producthunt si lancement → consolide l'entité dans le knowledge graph.
- 🟠 **Pas de `Review` / `AggregateRating` sur les annonces** : OK car KeyMatch n'a pas encore de système d'avis. À envisager V72+.
- 🟢 Aucun warning `Rich Results Test` détectable côté code (à valider en prod).

---

## 5. GEO / AEO (citabilité IA-search) — 9/20

### Acquis
- 🟢 Schema riche = parsable par les LLM crawlers (GPTBot, ClaudeBot, PerplexityBot lisent le JSON-LD).
- 🟢 Stats chiffrées dans la page ville (médian, min, max, count) → citables verbatim par AI Overviews.
- 🟢 FAQ Q/R structurée → format direct answer aligné Google AI Overviews.

### Issues
- 🔴 **Pas de `/llms.txt`** à la racine. Standard 2025 proposé par Anthropic/OpenAI : un index lisible pour LLMs des pages clés du site. **Effort S** : créer `public/llms.txt` listant `/`, `/annonces`, `/location/{ville}`, `/cgu`, `/contact`.
- 🔴 **Home `/` n'a pas de "direct answer" en H1+lead** : la home commence par un Hero visuel sans répondre à "C'est quoi KeyMatch ?" en 1 phrase indexable. Ajouter un paragraphe de 2-3 phrases factuelles sous le hero, citable par Perplexity/ChatGPT. **Effort S**.
- 🟠 **Pas de "Dernière mise à jour: {date}"** visible sur les pages villes/annonces — recency = trust signal AEO. **Effort S**.
- 🟠 **Pas de page `/à-propos`** auditable avec mission + dates fondation + nombres clés (utilisateurs, biens listés). C'est ce que ChatGPT cite quand on lui demande "C'est quoi KeyMatch ?". **Effort M**.
- 🟠 **Robots.txt n'autorise pas explicitement** `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`. Par défaut ils sont autorisés mais préciser un `User-agent: GPTBot` + `Allow: /` et `Allow: /annonces` est un signal positif post-2025.

---

## 6. Backlinks / Authority — 10/20 (recommandations hors code)

Aucun audit possible côté repo. Recommandations stratégiques :

- 🟠 **Inscriptions annuaires FR** : Pages Jaunes, Mappy, Bonjour France (gratuit), Petit Futé Logement.
- 🟠 **Citations presse lancement** : envoyer com' presse à Le Figaro Immobilier, Capital, BFM Patrimoine, Maddyness (startup FR), Frenchweb. Angle : "alternative SeLoger sans frais d'agence + matching IA".
- 🟠 **Articles invités** : MeilleursAgents blog, Bien'ici blog, Logic-immo blog, ADIL régionales. Sujets E-E-A-T : "DPE F 2028", "Caution Visale guide complet", "État des lieux numérique légalité".
- 🟠 **Partenariats notaires/ADIL** : backlink en footer "Partenaire KeyMatch" en échange de visibilité sur fiche annonce.
- 🟠 **Producthunt launch** : backlink dofollow + traffic.
- 🟠 **Forums immo qualité** : ForumConstruire, Le Particulier, Que Choisir Logement.

---

## Top 5 fixes prioritaires (impact × effort)

| # | Fix | Impact | Effort | ROI |
|---|-----|:------:|:------:|:---:|
| 1 | **Ajouter `generateMetadata` à `/` + `/annonces`** (server wrapper ou export static) — c'est les 2 pages les plus crawlées qui n'ont aujourd'hui que le default layout. Quick win SEO massif. | 🔥🔥🔥 | S | ⭐⭐⭐⭐⭐ |
| 2 | **`noindex` dynamique sur villes vides + retirer du sitemap** — évite le soft 404 / thin content sur ~80% des villes en V70 où il n'y a pas encore d'annonce. | 🔥🔥🔥 | S | ⭐⭐⭐⭐⭐ |
| 3 | **Créer `/og-default.png`** (1200×630) → tous les partages sociaux deviennent visuels. Aujourd'hui = 404 image. | 🔥🔥 | S | ⭐⭐⭐⭐ |
| 4 | **Créer `/llms.txt`** + **ajouter direct answer 2-3 phrases sur la home sous le hero** → citabilité ChatGPT/Perplexity/Google AI Overviews. | 🔥🔥 | S | ⭐⭐⭐⭐ |
| 5 | **Enrichir contenu éditorial par ville** (différencier par quartiers/transports/prix marché externe) — résoud le duplicate content + débloque vraie longue traîne. À déléguer à `location-page-generator-fr`. | 🔥🔥🔥 | L | ⭐⭐⭐ |

---

## Quick wins immédiats (< 1h chacun)

1. **Metadata `/annonces`** : extraire en server wrapper qui retourne `<AnnoncesClient/>`, ajouter `export const metadata = { title: "Toutes les annonces de location en France — KeyMatch", description: "Parcourez ${count} annonces de location entre particuliers sans frais d'agence. Filtrez par ville, budget, surface, DPE, équipements." }`. **15 min**.
2. **Metadata `/`** : idem, page server avec `<HomeClient/>` ou export static metadata. **15 min**.
3. **`/og-default.png`** : générer un OG 1200×630 avec logo + tagline KeyMatch. Placer dans `nestmatch/public/`. **20 min** (Figma export ou Canva).
4. **`/llms.txt`** : créer `nestmatch/public/llms.txt` minimal (URL clés + mission 1 phrase). **10 min**.
5. **`Organization.address` + `telephone` + `sameAs`** dans `layout.tsx` (ajouter dans `ORG_JSON_LD`). **5 min**.
6. **`User-agent: GPTBot/ClaudeBot/PerplexityBot Allow: /`** dans `robots.ts`. **5 min**.
7. **`noindex` si `total === 0`** dans `/location/[ville]/page.tsx` (générer `metadata.robots.index = false`). **10 min**.
8. **Remettre les villes vides hors sitemap** : dans `app/sitemap.ts`, faire un count par ville et filtrer. **20 min**.
9. **Ajouter "Dernière mise à jour : {updated_at}"** visible en haut des pages annonces et villes. **10 min**.

Total quick wins : ~2h, gain SEO significatif (passe d'un score estimé 72 → 82).

---

## Délégations recommandées (agents fils)

- **`real-estate-listing-schema-auditor`** : passer le JSON-LD au Rich Results Test live (post NO_INDEX désactivé) — le schema est complet mais valider qu'aucun warning Google n'est levé sur `priceSpecification.unitCode: MON` (peut nécessiter `unitText` complémentaire pour certains validateurs).
- **`location-page-generator-fr`** : enrichir le template ville avec quartiers + transports + données INSEE, résoud le duplicate content (point 5 du top fixes).
- **`aeo-geo-nextjs-optimizer`** : deep dive AEO — direct answers, page about, llms.txt, opt-in crawlers IA.
- **`nextjs-developer`** : implémenter les fixes Tech SEO (metadata `/` et `/annonces`, OG image, ISR si refacto).

---

## Synthèse 1 phrase

KeyMatch a un **socle SEO technique remarquablement solide pour un MVP V70** (sitemap dynamique, JSON-LD `RealEstateListing` quasi-parfait, ISR bien dosé, BreadcrumbList + FAQ + ItemList sur villes), mais perd ~28 points sur des **trous structurels faciles à boucher en 2h** : metadata manquante sur `/` + `/annonces`, OG par défaut absente, pas de `llms.txt`, contenu ville templatisé identique entre villes, et thin content potentiel sur ~80% des villes vides en V70.
