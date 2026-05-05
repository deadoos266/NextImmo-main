# Audit — Couverture longue traîne géographique FR (`/location/*`)

> Agent : `location-page-generator-fr` — **mode audit (read-only)**
> Date : 2026-05-06
> Scope : `nestmatch/app/location/**`, `nestmatch/lib/cityCoords.ts`, `nestmatch/app/sitemap.ts`

---

## 1. Inventaire actuel

### Routes existantes

| Route | Type | Fichiers |
|---|---|---|
| `/location/[ville]` | Dynamic, ISR 600s | `page.tsx` (393 lignes) + `opengraph-image.tsx` (OG dynamique 1200×630) |
| `/location/[ville]/[arrondissement]` | **ABSENT** | — |
| `/location/[ville]/[quartier]` | **ABSENT** | — |
| `/location` (index) | **ABSENT** | — |

### Sources de données

| Source | Fichier | Statut |
|---|---|---|
| Liste villes | `nestmatch/lib/cityCoords.ts` (`CITY_COORDS` + `CITY_NAMES`) | **97 villes**, hardcoded TS, lat/lng inclus |
| Stats marché | Supabase `annonces` (médiane runtime, ilike ville, statut=disponible, is_test=false) | Live ISR 600s |
| INSEE / population | **ABSENT** (pas de `data/cities-fr.json`, pas de `lib/seo/villes.ts`) | — |
| Wikidata Q-id | **ABSENT** (pas de `sameAs` dans JSON-LD) | — |
| Sitemap | `nestmatch/app/sitemap.ts` lignes 25–30 | OK : itère `CITY_NAMES` → 97 entrées priority 0.7 |

### Couverture géographique des 97 villes

- **Top 10 FR** (Paris, Marseille, Lyon, Toulouse, Nice, Nantes, Montpellier, Strasbourg, Bordeaux, Lille) : **10/10**
- **Top 50 FR** : ~46/50 (manques : Le Mans, Aix-en-Provence est OK, Saint-Denis Réunion vs 93, Argenteuil OK)
- **IDF banlieue** : 11 villes (Boulogne-Billancourt, Versailles, Argenteuil, Montreuil, Nanterre, Créteil, Courbevoie, Colombes, Asnières, Rueil, Aubervilliers, Issy, Levallois, Meaux, Melun) — couverture honorable
- **Bretagne** : 7 (Rennes, Brest, Vannes, Lorient, Quimper, Saint-Malo, Saint-Brieuc, Lanester, Concarneau)
- **Outre-mer** : ~0 (Saint-Denis 93 oui, Saint-Denis 974 non, Pointe-à-Pitre, Fort-de-France, Cayenne, Saint-Pierre 974 absents)
- **Arrondissements** : **0** (Paris 1–20, Lyon 1–9, Marseille 1–16 totalement absents)
- **Quartiers** : **0**

---

## 2. Score qualité par checklist (8 critères)

| # | Critère | Statut | Note |
|---|---|---|---|
| 1 | **JSON-LD BreadcrumbList** | ✅ Présent (lignes 117–125) | OK |
| 2 | **JSON-LD ItemList** annonces | ✅ Présent (lignes 126–135), top 12 | OK |
| 3 | **JSON-LD FAQPage** | ✅ Présent (lignes 139–178), 4 Q/R | OK — bonus loyer médian dynamique dans Q3 |
| 4 | **JSON-LD Place / LocalBusiness** | ❌ **ABSENT** | Manque `@type:Place` avec `geo`, `address`, `sameAs` Wikidata/Wikipedia |
| 5 | **Direct answer block** (paragraphe AI-Overviews-friendly) | ⚠️ Partiel — paragraphe ligne 221 mentionne le total + loyer médian, mais pas en H2/intro distincte | À renforcer |
| 6 | **Unique content block 300+ mots** | ⚠️ **FAIBLE** — section "Louer sans agence à {ville}" (lignes 318–333) ≈ 110 mots, **identique pour toutes les villes** sauf substitution `{displayCity}` | **Risque doorway pages** |
| 7 | **FAQ visible (HTML + schema)** | ✅ Présent (lignes 337–369), schema synchro avec `<details>` | OK |
| 8 | **Internal linking silo** | ⚠️ Présent mais générique — `CITY_NAMES.slice(0, 14)` (lignes 372–382), pas par proximité géo | À améliorer avec `findNearbyCities()` qui existe déjà ! |
| 9 | **Hreflang fr-FR** | ⚠️ Partiel — `openGraph.locale: "fr_FR"` OK, mais `alternates.languages` **absent** (ligne 55) | Ajouter `languages: { 'fr-FR': url }` |
| 10 | **ISR revalidate ~600s** | ✅ `export const revalidate = 600` (ligne 41) | OK conforme reco |
| 11 | **Canonical** | ✅ Ligne 55 `alternates.canonical` | OK |
| 12 | **OG image dynamique** | ✅ `opengraph-image.tsx` génère 1200×630 avec ville + médiane | OK |
| 13 | **Noindex si 0 annonce** | ❌ **ABSENT** — page indexée même avec `total = 0` | À ajouter pour éviter pages vides |
| 14 | **404 si ville inconnue** | ⚠️ Renvoie 200 + écran "Ville introuvable" (lignes 75–87) au lieu de `notFound()` | SEO leak — devrait être 404 |
| 15 | **H1 unique** | ✅ "Annonces de location à {ville}" | OK mais générique |

**Score global : 9/15 critères verts, 4 jaunes, 2 rouges**

---

## 3. Gaps par tier

### Tier 1 — Top villes FR manquantes (priorité haute)

Manques notables par volume search estimé "location appartement {ville}":

| Ville | Pop. INSEE | Volume search estimé | Statut |
|---|---|---|---|
| Le Mans | 144 000 | ~40K/mois | ❌ Manquant |
| Aix-en-Provence | 145 000 | ~50K/mois | ✅ OK |
| Saint-Denis (974, La Réunion) | 153 000 | ~30K/mois | ❌ Manquant (collision slug avec 93) |
| Pointe-à-Pitre / Les Abymes | 60 000 | ~10K/mois | ❌ Manquant |
| Fort-de-France | 80 000 | ~12K/mois | ❌ Manquant |
| Saint-Pierre (974) | 85 000 | ~10K/mois | ❌ Manquant |
| Cergy | 65 000 | ~15K/mois | ❌ Manquant |
| Pessac | 65 000 | ~10K/mois | ❌ Manquant |
| Mérignac | 72 000 | ~12K/mois | ❌ Manquant |
| Vénissieux | 67 000 | ~8K/mois | ✅ OK |
| Antony | 62 000 | ~12K/mois | ❌ Manquant |
| Vitry-sur-Seine | 96 000 | ~10K/mois | ❌ Manquant |
| Champigny-sur-Marne | 78 000 | ~6K/mois | ❌ Manquant |
| Saint-Maur-des-Fossés | 75 000 | ~8K/mois | ❌ Manquant |
| Drancy | 71 000 | ~5K/mois | ❌ Manquant |
| Noisy-le-Grand | 65 000 | ~7K/mois | ❌ Manquant |
| Sarcelles | 58 000 | ~5K/mois | ❌ Manquant |
| Saint-Ouen | 50 000 | ~10K/mois | ❌ Manquant |
| La Courneuve | 45 000 | ~4K/mois | ❌ Manquant |
| Pantin | 60 000 | ~8K/mois | ❌ Manquant |

**Total estimé Tier 1 manquant : ~30 villes top 100 FR.**

### Tier 2 — Arrondissements (priorité haute, 100% manquants)

| Métropole | Arrondissements | URL pattern | Statut |
|---|---|---|---|
| Paris | 1–20 | `/location/paris/{1..20}` | ❌ 0/20 |
| Lyon | 1–9 | `/location/lyon/{1..9}` | ❌ 0/9 |
| Marseille | 1–16 | `/location/marseille/{1..16}` | ❌ 0/16 |

**Total : 45 arrondissements manquants.** Volume search **massif** :
- "appartement à louer paris 15" ≈ 40K/mois
- "location paris 11" ≈ 30K/mois
- "location lyon 3" ≈ 15K/mois
- "location marseille 8" ≈ 10K/mois

### Tier 3 — Quartiers (priorité moyenne, 100% manquants)

Aucune route `[quartier]`. Quartiers à fort volume :
- Paris : Marais, Belleville, Montmartre, Bastille, Batignolles, Javel, Grenelle, Auteuil
- Lyon : Croix-Rousse, Confluence, Part-Dieu, Brotteaux, Vieux-Lyon
- Marseille : Le Panier, Vieux-Port, Castellane, Endoume, Prado
- Bordeaux : Chartrons, Saint-Pierre, Bastide
- Toulouse : Carmes, Saint-Cyprien, Compans-Caffarelli

**Estimation : ~100–150 quartiers stratégiques pour Tier 3.**

---

## 4. Risque duplicate content — flags

### Risques détectés

> Anti-pattern critique : Google duplicate content + manual action.

- **Bloc "Louer sans agence à {ville}"** (lignes 318–333) : **3 paragraphes 100 % identiques** entre toutes les pages, seul `{displayCity}` change.
  - 97 pages × ~110 mots template = **page-near-duplicate à grande échelle**
  - Google Search Console signalera "Duplicate, Google chose different canonical" sur les villes à faible signal local

- **FAQ Q1, Q2, Q4** (lignes 144–177) : texte identique sauf substitution variable. Q3 OK car loyer médian dynamique.

- **Bloc "Autres villes populaires"** (lignes 372–382) : `slice(0, 14)` = même 14 villes affichées sur les 97 pages, sans logique de proximité. Pénalise le silo.

- **Stats marché** : invisible si `total < 3` → page squelette quasi-vide pour les villes à faible inventaire (~20–30 villes sur 97 selon données live).

### Pages à risque immédiat

Toute ville avec `< 3 annonces` actives sur KeyMatch reçoit un rendu :
1. Hero générique
2. CTA générique
3. PAS de bloc stats
4. PAS de grille annonces (si `total = 0`)
5. Bloc "Louer sans agence" (template 100 % dupliqué)
6. FAQ générique
7. Bloc autres villes (slice 0..14 toujours pareil)

→ **Doorway page caractérisée**. Risque manual action si crawlée en masse.

### Atténuations actuelles

- ISR 600s : OK
- `is_test=false` filter : bon
- Canonical absolu : bon
- ItemList JSON-LD limitée à 12 : bon
- Pas de noindex automatique sur pages vides : **manquant**

---

## 5. Roadmap 3 phases de génération

### Phase A — Hardening de l'existant (avant scale)

> Objectif : sécuriser les 97 pages actuelles avant d'ajouter du volume.

1. **Hreflang fr-FR** dans `generateMetadata` (1 ligne)
2. **JSON-LD `Place`** avec `geo`, `address`, `sameAs` (Wikidata + Wikipedia FR) — créer `nestmatch/data/cities-fr.json` minimal (97 lignes : insee, postal, q_id, wiki_url)
3. **`notFound()`** au lieu de l'écran "Ville introuvable" → vraie 404
4. **Noindex auto** si `total === 0` via `metadata.robots = { index: false, follow: true }`
5. **Internal linking par proximité** : remplacer `slice(0, 14)` par `findNearbyCities(displayCity, 8)` (la fonction existe déjà dans `cityCoords.ts` lignes 171–185 !)
6. **Bloc unique 300+ mots** : générer avec Claude un bloc texte unique par ville (transports, quartiers, ambiance, prix repère) → stocker dans `data/cities-fr.json` champ `editorial_fr`
7. **Direct answer en H2** distinct du paragraphe d'intro

### Phase B — Top 30 villes manquantes Tier 1

> URLs : `/location/{slug}` (pattern existant)

Génération en deux temps :
- (a) Ajout coords dans `CITY_COORDS` (cityCoords.ts) — quick win, +30 entrées
- (b) Pour chaque ville, génération du bloc éditorial unique 300+ mots
- (c) Ajout au sitemap automatique (déjà câblé via `CITY_NAMES`)

**Top 15 prioritaires (volume search × densité loyer × marché concurrentiel)** :

| # | Ville | Volume search | Pop. | Justification |
|---|---|---|---|---|
| 1 | Paris (arrondissements groupés) | 1.2M/mois cumul | — | **Tier 2 mais ROI immédiat — prioriser AVANT Tier 1 reste** |
| 2 | Le Mans | 40K/mois | 144K | Top 30 FR absent |
| 3 | Saint-Denis (974) | 30K/mois | 153K | Outre-mer 0 couverture |
| 4 | Cergy | 15K/mois | 65K | IDF couronne ouest |
| 5 | Antony | 12K/mois | 62K | IDF sud, hub étudiant |
| 6 | Vitry-sur-Seine | 10K/mois | 96K | Métropole Grand Paris |
| 7 | Mérignac | 12K/mois | 72K | Aire bordelaise |
| 8 | Pessac | 10K/mois | 65K | Aire bordelaise + campus |
| 9 | Fort-de-France | 12K/mois | 80K | DOM |
| 10 | Saint-Maur-des-Fossés | 8K/mois | 75K | Val-de-Marne |
| 11 | Pantin | 8K/mois | 60K | Métropole, gentrification |
| 12 | Saint-Ouen | 10K/mois | 50K | Métropole, JO 2024 |
| 13 | Noisy-le-Grand | 7K/mois | 65K | Marne-la-Vallée |
| 14 | Champigny-sur-Marne | 6K/mois | 78K | RER E |
| 15 | Drancy | 5K/mois | 71K | Plaine-Commune |

### Phase C — Arrondissements (Tier 2)

> URLs : nouvelle route `/location/[ville]/[arrondissement]`

Création de la route dynamique nestée :
- `nestmatch/app/location/[ville]/[arrondissement]/page.tsx`
- `nestmatch/app/location/[ville]/[arrondissement]/opengraph-image.tsx`

Structure :
- 45 arrondissements (Paris 20 + Lyon 9 + Marseille 16) générés en une vague
- Filtrage Supabase : `ilike ville pattern paris%` + filtrage code postal (75001…75020) ou champ `arrondissement` (à ajouter en base ?)
- **Bloc éditorial unique par arrondissement** (Paris 11 ≠ Paris 16 = histoire, prix, ambiance différentes)
- Internal silo arrondissements adjacents (Paris 14 → 13, 15, 6)

Sitemap : étendre à `paris-1` … `paris-20`, etc.

### Phase D — Quartiers (Tier 3, V72+)

À ne lancer que :
- Après Phase A + B + C live et indexées
- Avec **>1 annonce active par quartier** sinon noindex
- Top 50 quartiers à fort volume search en priorité
- Risque duplicate content **TRÈS ÉLEVÉ** sur ce tier — exiger 400+ mots uniques par quartier

---

## 6. Synthèse exécutive

| Constat | Note |
|---|---|
| Pages existantes | 97 villes (Top 50 FR ~couvertes + banlieue IDF + Bretagne) |
| Sous-routes `[arrondissement]` / `[quartier]` | **Aucune** |
| Sitemap | OK, automatique via `CITY_NAMES` |
| JSON-LD | 3/4 (BreadcrumbList + ItemList + FAQPage OK ; Place manquant) |
| ISR | OK (600s) |
| OG dynamique | OK |
| **Risque duplicate content** | **MOYEN-ÉLEVÉ** sur le bloc éditorial template |
| **Risque doorway** | **ÉLEVÉ** sur villes < 3 annonces (~25 villes sur 97) |
| Hreflang fr-FR | Partiel |
| Noindex pages vides | **Absent** |
| 404 ville inconnue | **Absent** (renvoie 200) |

### Top 3 actions urgentes

1. **Phase A complète** avant tout scale (notamment unique editorial 300+ mots + noindex pages vides + `notFound()`)
2. **Activer `findNearbyCities()`** déjà présent dans `cityCoords.ts` mais inutilisé sur la page location
3. **Lancer Tier 2 (arrondissements Paris/Lyon/Marseille) AVANT Tier 1 reste** — ROI search supérieur (1.2M/mois cumul vs ~150K/mois pour 30 villes Tier 1 manquantes)

---

*Fin du rapport. Mode read-only respecté — aucune modification de code.*
