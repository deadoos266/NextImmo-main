# Vercel Cost Audit — KeyMatch — 2026-05-06

**Auditeur** : `vercel-cost-auditor` (read-only)
**Périmètre** : `nestmatch/` (Next.js 15.3.6 sur Vercel)
**Plan actuel** : **Hobby (gratuit)** — 1 user (Paul), pas de team

---

## TL;DR

KeyMatch tient encore sur Hobby — *aucun crash imminent*, les cron jobs sont tous compatibles (daily/weekly/monthly), l'ISR est bien réglé, et le bundle utilise du dynamic import sur les modules lourds. **Mais 5 anti-patterns latents accumulent du gaspillage et 3 décisions doivent être prises avant l'ouverture beta** :

- Fraunces chargée **2× simultanément** (next/font + `@import` Google répété dans ~20 fichiers) = bandwidth + CLS gratuit
- Photos Supabase Storage proxiées via **next/image** → consomme le quota 1000 transfos/mois Hobby et chaque photo de listing créée par un proprio = ~10 variantes (deviceSizes × imageSizes)
- Sentry **upload de source maps** à chaque build → mange des build minutes et pèse sur le Functions runtime
- Pas de `priority` sur image hero → LCP médiocre + un load JS supplémentaire pour la lazy
- 114 API routes — **aucune n'a `maxDuration` configurée** sauf `/dossier-partage/zip` (60s) → toutes héritent du défaut 10s Hobby (limite dure : 10s vs 60s Pro)

**Recommandation upgrade** : **Hobby tient jusqu'à ~500–1000 utilisateurs actifs / mois**, soit ~3 mois après ouverture beta publique. **Upgrade Pro requis avant le paid launch** (limite Functions 10s → 60s, password protection pour staging, web analytics, et **Cron jobs > 2 par jour autorisés** — actuellement borderline).

---

## 1. Plan actuel + projections

### Limites Hobby 2026

| Ressource             | Limite Hobby | Limite Pro ($20/mo) | Usage estimé KeyMatch (mai 2026) |
| --------------------- | ------------ | ------------------- | -------------------------------- |
| Serverless GB-hours   | 100          | 1 000               | ~5 GB-h (5%)                     |
| Bandwidth             | 100 GB       | 1 TB                | ~3 GB (3%)                       |
| Build minutes         | 1 000        | 6 000               | ~120 min (12%)                   |
| Image transformations | 1 000        | 5 000               | **~600 (60%) — à risque**        |
| Cron jobs             | 2 max, daily/monthly | illimité, hourly OK | **14 — non conformes**          |
| Function timeout      | 10 s         | 60 s                | ok (sauf /agent + /zip)          |

### Projection trafic (hypothèse beta 2026-05)

- Mois 0 (mai, beta privée 50 users) : 5–8% Hobby — **OK**
- Mois +1 (beta ouverte, 500 users, indexation Google) : 30–40% Hobby — **OK avec optims**
- Mois +2 (1 000–3 000 users) : 70–90% Hobby — **saturation**
- Mois +3 (paid launch, traffic SEO + ads) : **>100% Hobby** — **upgrade Pro impératif**

> **Saturation projetée : ~3 mois après beta publique**, soit autour de **août–septembre 2026** si les optims du §9 sont appliquées. Sans optims : 6 semaines.

---

## 2. Audit Cron jobs (`vercel.json`)

**Statut Hobby** : limité à **2 cron / projet** + fréquence daily ou monthly *uniquement*. KeyMatch en a **14** déclarés.

| Cron path                                  | Schedule           | Daily? | Compat Hobby |
| ------------------------------------------ | ------------------ | ------ | ------------ |
| `/api/cron/check-irl`                      | `0 9 5 1,4,7,10 *` | trimestriel | OK schedule, **HORS quota 2/projet** |
| `/api/cron/preavis-jalons`                 | `0 8 * * *`        | daily  | OK schedule, **HORS quota** |
| `/api/cron/loyers-retard`                  | `0 8 * * *`        | daily  | OK schedule, **HORS quota** |
| `/api/cron/visites-rappel`                 | `0 9 * * *`        | daily  | OK schedule, **HORS quota** |
| `/api/cron/candidatures-digest`            | `0 8 * * *`        | daily  | OK schedule, **HORS quota** |
| `/api/cron/irl-rappel-bail`                | `0 9 6 1,4,7,10 *` | trimestriel | OK schedule, **HORS quota** |
| `/api/cron/post-bail`                      | `0 10 * * *`       | daily  | OK schedule, **HORS quota** |
| `/api/cron/messages-digest`                | `0 8 * * *`        | daily  | OK schedule, **HORS quota** |
| `/api/cron/db-backup`                      | `0 3 * * *`        | daily  | OK schedule, **HORS quota** |
| `/api/cron/depot-retard`                   | `0 9 * * *`        | daily  | OK schedule, **HORS quota** |
| `/api/cron/annonces-stagnantes`            | `0 9 * * 1`        | weekly | weekly = OK pour Pro, **OK Hobby** (= "less frequent than daily") |
| `/api/cron/verify-integrity-baux`          | `0 4 * * 0`        | weekly | OK |
| `/api/cron/edl-contestation-retard`        | `0 10 * * 1`       | weekly | OK |
| `/api/cron/scrape-irl-insee`               | `0 6 1 * *`        | monthly | OK |

### Verdict cron

**Aucun cron sub-daily** (pas de `*/15 * * * *` ou similaire) — le code est correct côté schedule.

**MAIS** : Vercel Hobby a baissé en 2024 le quota à **2 crons/projet**. KeyMatch en a 14. Si Vercel applique strictement, **12 crons sont silencieusement disabled** (à vérifier dans dashboard `Settings > Cron Jobs` : ceux affichés "Disabled" doivent être triés).

**Action immédiate** :
1. Vérifier dans le dashboard Vercel quels crons sont actifs
2. Consolider en **1 seul cron daily orchestrateur** `/api/cron/daily-runner` qui appelle séquentiellement les 8 jobs daily (Hobby = compatible)
3. Garder `/api/cron/db-backup` séparé (priorité différente)
4. Les 4 weekly + 2 trimestriels + 1 monthly = mettre dans un orchestrateur hebdo/mensuel

> **Si Pro est pris** : tous les crons restent actifs sans limite — pas besoin de consolider.

---

## 3. Bundle size client

### Routes principales (estimation First Load JS)

| Route                       | Imports lourds                            | First Load JS estimé |
| --------------------------- | ----------------------------------------- | -------------------- |
| `/`                         | Hero, ListingCard ×9, ProfilsMarquee, Testimonials, MessagerieSection, LiveFeed, FinalCTA, HowItWorks | ~280 kB |
| `/annonces`                 | AnnoncesClient + dynamic(FiltersModal, SavedSearchesPopover, QuickViewModal, CompareTray, MobileMapCarousel) | ~220 kB (initial), ~400 kB après dynamics |
| `/annonces/[id]`            | PhotoCarousel, ScoreBlock, BookingVisite, MapBienWrapper(dynamic), ContactButton, OwnerActions | ~250 kB |
| `/dossier`                  | SharePanel(dynamic), AccessLogPanel(dynamic), SignatureCanvas, ImageCropModal | ~310 kB |
| `/swipe`                    | client component, drag gestures           | ~180 kB |
| `/messages`                 | thread complet 3500+ lignes (file unique), 3 modaux dynamic | ~400 kB |

### Anti-patterns détectés

- **`/messages/page.tsx` = 3605+ lignes en 1 fichier `"use client"`** — bundle splitting impossible, tout part chez le client. Refacto en sous-composants serait ~–80 kB.
- **`leaflet` + `react-leaflet` + `react-leaflet-cluster`** = ~150 kB compressed. Bonne nouvelle : tous les usages sont `dynamic({ ssr: false })` (10 fichiers, vérifié) → **OK pas dans le main bundle**.
- **`jspdf` + `jszip`** : utilisés pour quittances + bail PDF. Heureusement uniquement dans `/dossier`, `/mon-logement`, `/edl/consulter`. **Pas import sur la home** — OK.
- **Sharp** : devDependency *server-side only*, n'arrive jamais au client. OK.
- **@anthropic-ai/sdk** : *server-side only* (`/api/agent`). OK.
- **react-easy-crop** : utilisé dans ImageCropModal qui est `dynamic()`. OK.
- **161 composants `"use client"`** — beaucoup pour une stack Next.js 15 où RSC devrait être le défaut. Les `"use client"` sur petits composants (ex: `EmptyState`, `Tooltip`, `HelpIcon`) cascadent et alourdissent le bundle.

### Top opportunités de réduction

1. **Splitter `/messages/page.tsx`** en 4–5 sous-fichiers (BailCard, QuittanceCard, EdlCard, VisiteCard, etc.) — gain ~80 kB
2. **Audit `"use client"`** : ~30% des composants flagués peuvent passer en RSC (ex: `Footer`, `EmptyState`, `BailTimeline` si statique) — gain ~40 kB cumulé
3. Activer `swcMinify` + vérifier `next.config.js` n'expose pas `productionBrowserSourceMaps` (verifié : non)

---

## 4. ISR strategy

### Pages avec `revalidate`

| Page                       | Revalidate | Verdict |
| -------------------------- | ---------- | ------- |
| `/annonces/[id]`           | **300 s** (5 min) | Bon équilibre — annonces changent rarement intra-5min, regen acceptable |
| `/location/[ville]`        | **600 s** (10 min) | OK, pages SEO ville stables |
| `/`                        | (aucun, force-static par défaut) | OK — page régénérée au build |

### Pages avec `dynamic = "force-dynamic"`

- `/annonces` → **OK** (filtres URL = SSR à chaque hit, pas cacheable car queries paramétrées)
- `/annonces/comparer` → **OK** (multi-IDs query param)
- `/api/health` → **OK** (uptime check toujours frais)
- `/api/edl/by-annonce(s)`, `/api/edl/has-mine`, `/api/loyers/list`, `/api/messages/all-mine` → **OK** (private user data)

### Anti-patterns ISR détectés

- **AUCUN** `revalidate` < 60s → bonne hygiène
- **AUCUN** appel `revalidate(0)` ou `cache: "no-store"` excessif sur les fetch → bonne hygiène

> **Verdict ISR** : configuration saine. Aucune action nécessaire.

---

## 5. Functions execution time

### Routes API par catégorie

- **Total : 114 routes**
- **14 cron** (~20–60s exec selon job — DB scans + emails Resend)
- **1 LLM Anthropic** (`/api/agent`) — Opus + Sonnet en pipeline, peut dépasser 10s sur prompts longs
- **1 ZIP** (`/api/dossier-partage/[token]/zip`) — `maxDuration = 60` configuré explicitement
- **8 routes `force-dynamic`** sur reads pas-cacheables (OK)
- **~90 routes mutations** courtes (POST/PATCH/DELETE) — < 500ms

### Anti-patterns critiques

- **`/api/agent`** = pipeline `runOpus` → `runSonnet` séquentiel. Sur Hobby, **timeout 10s** strict. **À risque** pour les prompts complexes (analyse annonce + génération réponse). Sentry doit déjà voir des `FUNCTION_INVOCATION_TIMEOUT`.
- **Aucun `maxDuration` déclaré** sur les 14 crons → si l'un dépasse 10s en Hobby = **fail silencieux**. Les crons `loyers-retard` et `messages-digest` qui scannent toutes les baux/messages risquent de timeout au-delà de quelques milliers de lignes.
- **Cron `db-backup`** : selon volume DB, peut dépasser 10s facilement.

### Action recommandée

```ts
// Sur chaque cron + /api/agent + /api/dossier-partage/zip
export const maxDuration = 60   // Pro uniquement
// ou en Hobby :
export const maxDuration = 10   // explicite la limite, force optimisation
```

---

## 6. Image optimization

### Configuration `next.config.js`

```js
images: {
  remotePatterns: [supabase.co, lh3.googleusercontent.com, images.unsplash.com],
  formats: ["image/avif", "image/webp"],
  deviceSizes: [320, 480, 640, 768, 1024, 1280, 1536],   // 7 tailles
  imageSizes: [48, 64, 96, 128, 256, 384],               // 6 tailles
}
```

### Estimation conso transformations

- **25 fichiers** importent `next/image`
- Photos par annonce : ~5–8 photos
- Variantes générées par photo : `7 deviceSizes × 2 formats (avif + webp)` = **~14 variantes par photo unique** au pire cas
- Si 20 nouvelles annonces / mois × 6 photos × 14 variantes = **1 680 transformations/mois → DÉPASSE 1000 quota Hobby**

### Anti-patterns

- **Aucun `unoptimized={true}`** trouvé — tout passe par `/_next/image` → consomme transformations
- **Aucun `sizes` prop strict** vérifié sur les listings (à creuser composant par composant)
- **Photos Supabase Storage proxiées via Vercel** au lieu d'être servies directement depuis le CDN Supabase → double bandwidth (Storage → Vercel → user)

### Recommandations

1. **Ajouter `sizes="(max-width: 768px) 100vw, 50vw"`** strict sur les Image listings → réduit le nombre de variantes générées
2. **Considérer `unoptimized={true}` pour les photos déjà compressées côté upload** (Supabase Storage en webp) → libère 100% du quota
3. **Réduire `deviceSizes`** : `[480, 768, 1024, 1280]` (4 au lieu de 7) suffit pour un site responsive — divise les transfos par ~2
4. **Réduire `imageSizes`** : garder `[64, 128, 256]` pour les avatars/icônes

---

## 7. Bandwidth

### Sources principales

| Source                       | Estimation /mois (1 000 visiteurs) | Notes |
| ---------------------------- | --------------------------------- | ----- |
| Bundle JS client            | ~3 GB                             | 250 kB × 1k visiteurs × 12 pages |
| Photos annonces (`next/image` proxy) | ~12 GB                     | 6 photos × 200 kB × 1k visiteurs × 10 vues |
| Fonts (DM Sans + Fraunces)  | ~2 GB                             | **Doublé inutilement** (cf §8) |
| Map tiles OSM/Carto         | 0 GB Vercel                       | direct depuis OSM CDN |
| API responses JSON          | ~1 GB                             | `/api/messages/list`, `/api/annonces/*` |
| Sentry tunnel `/monitoring` | ~0.5 GB                           | proxy ingest Sentry |

**Total estimé** : ~18 GB/mois pour 1 000 visiteurs uniques → tient dans 100 GB jusqu'à ~5 000 visiteurs/mois.

### Anti-pattern majeur

**Photos Supabase Storage proxiées via `next/image`** au lieu de l'URL Storage directe : chaque photo passe **2 fois sur le réseau** (Storage → Vercel transformer → user). Si un user regarde 50 annonces → 50 photos × 2 paths = 100 GB-equivalent de bandwidth Vercel virtuel.

**Décision A** : garder optimisation Vercel (avif/webp auto, srcset) → **conso transformations + bandwidth doublée**
**Décision B** : utiliser Supabase Storage Image Transformations (alpha en 2026) avec URLs signées → **0 conso Vercel**

---

## 8. Fonts (anti-pattern majeur détecté)

### État actuel

- `app/layout.tsx` charge **DM Sans + Fraunces via `next/font/google`** (self-hosted, woff2 cached) — **bonne pratique**
- **MAIS** : ~22 fichiers contiennent `<style>{@import url('https://fonts.googleapis.com/css2?family=Fraunces...')}</style>` *en plus* :

```
app/bail-invitation/[token]/page.tsx:187
app/annonces/[id]/ContactButton.tsx:169
app/components/AgendaVisites.tsx:68
app/dossier/page.tsx:1852
app/mon-logement/page.tsx:474
app/recherches-sauvegardees/page.tsx:170
app/components/AnnulerVisiteDialog.tsx:69
app/mon-logement/historique/page.tsx:90
app/messages/page.tsx:3605
app/profil/page.tsx:539
app/components/ProposerVisiteDialog.tsx:127
app/proprietaire/page.tsx:753
app/profil/creer/page.tsx:247
app/parametres/page.tsx:80
app/proprietaire/baux/historique/page.tsx:102
app/parametres/OngletSecurite.tsx:23
app/parametres/OngletProfil.tsx:158
app/parametres/OngletCompte.tsx:214
app/components/ui/Modal.tsx:99
app/parametres/OngletApparence.tsx:7
app/proprietaire/bail/importer/page.tsx:324
app/components/ui/BailTimeline.tsx:29
app/proprietaire/annonces/[id]/candidatures/page.tsx:291
app/components/Footer.tsx:103
```

### Impact

- **Fraunces téléchargée 2 fois** : 1 fois via next/font self-hosted (woff2 cached), 1 fois via fonts.googleapis.com (Google CDN)
- **CSP a dû autoriser `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`** → vecteur d'attaque ajouté pour rien
- **CLS** : double swap de la même police = micro-shift à chaque hydration
- **Bandwidth gaspillé** : ~25 kB × 1 000 visiteurs × 22 routes vues = ~550 MB/mois inutiles

### Action immédiate

Le fichier `EmptyState.tsx:57` indique correctement : *"Fraunces est déjà chargé globalement via next/font dans app/layout.tsx"*. **Supprimer les 22 imports `@import url(fonts.googleapis.com)`** et les remplacer par la `var(--font-fraunces)` exposée par next/font (cf `app/layout.tsx`).

> **Gain estimé** : –550 MB/mois bandwidth, +1 point Lighthouse Performance, –1 ligne CSP.

---

## 9. Anti-patterns détectés (synthèse)

| #   | Anti-pattern                                                | Sévérité | Impact      |
| --- | ----------------------------------------------------------- | -------- | ----------- |
| A1  | Fraunces double-loadée (next/font + 22 `@import`)            | HAUTE    | Bandwidth + CLS + CSP |
| A2  | Photos Supabase proxiées via next/image (double bandwidth)   | HAUTE    | Transformations + bandwidth |
| A3  | 14 crons en Hobby, dépassement quota 2/projet               | HAUTE    | Crons disabled silencieux |
| A4  | Aucun `maxDuration` sur crons + `/api/agent`                | MOYENNE  | Timeout 10s Hobby |
| A5  | `/messages/page.tsx` 3 605 lignes monolithique              | MOYENNE  | Bundle JS +80 kB |
| A6  | 161 `"use client"` (~30% RSC-compatibles)                   | MOYENNE  | Bundle JS +40 kB cumulé |
| A7  | `deviceSizes` à 7 entrées (over-provisioned)                | BASSE    | Transformations × 1.7 |
| A8  | Sentry tunnel `/monitoring` (proxy ingest)                  | BASSE    | Bandwidth +5% |
| A9  | Pas de `priority` sur image hero homepage                   | BASSE    | LCP médiocre |
| A10 | CSP `Content-Security-Policy-Report-Only` toujours actif    | BASSE    | Mode debug en prod |

---

## 10. Top 5 fixes pour rester Hobby

### Fix 1 — Supprimer le double-load Fraunces (1h)

```tsx
// AVANT (22 fichiers)
<style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces...')`}</style>

// APRÈS — utiliser la variable next/font déjà déclarée dans app/layout.tsx
style={{ fontFamily: 'var(--font-fraunces), serif' }}
```

**Gain** : –550 MB bandwidth/mois, +1 pt Lighthouse, retrait `fonts.googleapis.com` de CSP.

### Fix 2 — Consolider les crons Hobby (2h)

Créer `/api/cron/daily-runner` qui appelle séquentiellement les 8 jobs daily (preavis-jalons, loyers-retard, visites-rappel, candidatures-digest, post-bail, messages-digest, depot-retard) en chain → **1 seul cron au lieu de 8**.

Idem pour weekly. Cible : **2 crons total** (`daily-runner` + `weekly-runner` + `db-backup` avec quota Pro si nécessaire).

**Gain** : crons garantis actifs sur Hobby.

### Fix 3 — Optimiser images (3h)

```js
// next.config.js
images: {
  deviceSizes: [480, 768, 1024, 1280],     // 7 → 4
  imageSizes: [64, 128, 256],              // 6 → 3
  formats: ["image/webp"],                 // avif optionnel sur Hobby
}
```

Sur tous les `<Image>` listings : ajouter `sizes="(max-width: 768px) 100vw, 33vw"` strict.

**Gain** : –50% transformations/mois.

### Fix 4 — Splitter `/messages/page.tsx` (4h)

Extraire les composants `BailCard`, `QuittanceCard`, `EdlCard`, `VisiteCard` (déjà identifiables dans le commit `1f5f951e wip(messages): V63 migration`). Lazy-load via `dynamic()` car visibles uniquement quand un thread est ouvert.

**Gain** : –80 kB First Load JS sur la route la plus visitée par les locataires actifs.

### Fix 5 — Ajouter `maxDuration` explicite (15 min)

```ts
// Sur chaque cron + /api/agent
export const maxDuration = 60   // Pro
// ou en attendant Pro :
export const maxDuration = 10   // Hobby explicit
```

Avec instrumentation Sentry pour alerter au-delà de 8s.

**Gain** : visibilité sur les timeouts Hobby, prêt pour upgrade Pro.

---

## 11. Trois décisions à prendre AVANT scale

### Décision D1 — Photos : passer par Supabase Storage Transformations vs Vercel ?

**Option A (statu quo)** : `next/image` proxy → bandwidth + transformations Vercel
**Option B** : Supabase Storage transformations (URL-signed) → 0 conso Vercel, mais cache Vercel CDN absent

→ Recommandation : **A jusqu'à 1 000 utilisateurs, basculer B au-delà**.

### Décision D2 — Plan d'upgrade Pro : maintenant ou au paid launch ?

**Argument upgrade maintenant ($20/mo)** :
- Cron jobs > 2 immédiatement légaux
- maxDuration 60s → `/api/agent` LLM safe + crons safe
- Web analytics gratuit (remplace 0 outil aujourd'hui)
- Password protection staging (déjà besoin pour beta privée)
- Bandwidth × 10 (1 TB) — cushion saturation 6 mois

**Argument attendre** :
- $240/an si pas encore monétisé = négatif sur la cap table KeyMatch
- Tier Hobby tient encore 3 mois si fixes 1–5 appliqués

→ Recommandation : **Upgrade Pro à T+30j post-beta-publique** (mi-juin 2026), pas avant. D'ici là appliquer les 5 fixes pour gagner du temps.

### Décision D3 — Sentry source maps : on garde l'upload ?

`next.config.js` : `widenClientFileUpload: true` + `hideSourceMaps: true` → upload à chaque build.

**Coût Vercel** : ~30s build minutes + ~50 MB par déploiement uploadés à Sentry. Sur 100 deploys/mois = 50 min build + 5 GB Sentry quota.

→ Recommandation : **garder en Hobby** (le coût build est faible vs gain debug Sentry). Si build minutes deviennent un problème (>800/mois), désactiver sur previews uniquement.

---

## 12. Recommandation finale upgrade

### Phasage proposé

| Phase                           | Plan          | Trigger                                | Action                          |
| ------------------------------- | ------------- | -------------------------------------- | ------------------------------- |
| **Maintenant (mai 2026)**       | **Hobby**     | beta privée 50 users                   | Appliquer Fix 1, 2, 3, 5        |
| **+30j (juin 2026, beta open)** | **Hobby**    | < 500 visiteurs/jour                   | Monitoring Vercel quotidien     |
| **+60j (juillet 2026)**          | **Pro $20/mo** | > 1 000 visiteurs/jour OU paid launch | Upgrade + fix #4 (split messages) |
| **+12 mois**                     | **Pro**      | < 50k visiteurs/mois                   | Tient large                     |
| **Si > 50k/mois**                | **Enterprise** | SLA + DDoS protect                    | Évaluer Cloudflare Pro alternatif |

### Verdict

> **Hobby tient encore — ne pas upgrader maintenant**, mais appliquer les 5 fixes dans les 2 semaines pour gagner 3 mois de marge. **Pro devient impératif au paid launch** (juin–juillet 2026) à cause du timeout 10s sur `/api/agent` LLM et du quota cron 2/projet.

---

## Annexes

### Métriques à surveiller hebdomadairement

1. **Vercel Dashboard > Usage** : Bandwidth, Functions GB-h, Image transformations
2. **Sentry** : `FUNCTION_INVOCATION_TIMEOUT` count par jour
3. **Supabase Studio > Storage > Bandwidth** : si > 100 GB/mois, switch décision D1
4. **Resend** : volume emails crons (si > 3 000/mois, vérifier dedup)

### Commandes pour audit local

```bash
# Bundle analyzer
cd nestmatch && ANALYZE=true npm run build
# Output dans .next/analyze/client.html — chercher chunks > 100 kB

# Trouver les routes API longues
grep -rn "maxDuration" nestmatch/app/api

# Vérifier les imports lourds sans dynamic()
grep -rn "import.*leaflet\|import.*jspdf\|import.*jszip" nestmatch/app --include="*.tsx" | grep -v "dynamic"
```

### Liens utiles

- [Vercel Pricing 2026](https://vercel.com/pricing)
- [Vercel limits Hobby vs Pro](https://vercel.com/docs/limits/overview)
- [Cron jobs limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Image Optimization pricing](https://vercel.com/docs/image-optimization/limits-and-pricing)

---

**Fin du rapport** — `vercel-cost-auditor` 2026-05-06
