# AUDIT FULL KeyMatch — 2026-05-06

Audit 11 dimensions exécuté avec les 11 agents `.claude/agents/` (10 batch 3 + site-health-checker).

## TL;DR

**Site en bonne santé technique** (HTTPS preload, headers durcis, RLS Phase 5, indexes 51, 296 URLs sitemap), **mais 6 trous bloquants pour passage commercial** :
- 🔴 Mentions légales incomplètes (TODO SIRET/RCS) — risque LCEN art. 6-VI : 1 an / 75k€
- 🔴 DPIA RGPD absente (Art. 35) — obligatoire avant paid launch (KYC + finance)
- 🔴 Banner cookies non-conforme (hiérarchie boutons) — risque CNIL similaire à Google 150M€
- 🔴 Homepage `/` en `"use client"` total → invisible IA-search + SEO dégradé
- 🔴 `og-default.png` référencé mais absent → tous les partages sociaux retournent image 404
- 🔴 `/sitemap.xml` 296 URLs OK mais robots.txt `Disallow: /proprietaire` à revoir si landing publique

**Score global pondéré : 72/100**

---

## Scores par dimension

| # | Dimension | Score | Statut | Lien |
|---|-----------|-------|--------|------|
| 01 | SEO global (6 dim) | **72/100** | 🟠 | [01-seo-overview.md](./01-seo-overview.md) |
| 02 | Schema RealEstateListing | **21/30 (70)** | 🟠 | [02-schema-real-estate.md](./02-schema-real-estate.md) |
| 03 | AEO/GEO (IA-search) | **71/100** | 🟠 | [03-aeo-geo.md](./03-aeo-geo.md) |
| 04 | Location pages /location/[ville] | **9/15 verts** | 🟠 | [04-location-pages-status.md](./04-location-pages-status.md) |
| 05 | RGPD compliance | **62/100** | 🔴 | [05-rgpd-audit.md](./05-rgpd-audit.md) |
| 06 | Légal FR (CGU/mentions/conf/cookies) | **78/100** | 🟠 | [06-legal-fr.md](./06-legal-fr.md) |
| 07 | Email deliverability (Resend) | **74/100** | 🟠 | [07-email-deliverability.md](./07-email-deliverability.md) |
| 08 | Vercel cost (Hobby) | **3 mois runway** | 🟠 | [08-vercel-cost.md](./08-vercel-cost.md) |
| 09 | Supabase cost (Free) | **6-12 mois runway** | 🟢 | [09-supabase-cost.md](./09-supabase-cost.md) |
| 10 | SQL/Postgres perf | **74/100** | 🟠 | [10-sql-perf.md](./10-sql-perf.md) |
| 11 | Site health live | **WARNINGS** | 🟠 | [11-site-health.md](./11-site-health.md) |

### Score par catégorie

| Catégorie | Score /10 | Détails |
|---|---|---|
| 🔍 SEO | **7.2** | Bon socle RealEstateListing + sitemap dynamique. Pénalités : home `"use client"`, og-default absent, location pages dupliquées |
| 🔐 Sécurité | **8.5** | RLS Phase 5 ✅, headers HSTS/Referrer/Permissions ✅, redirect 307 routes auth ✅. À durcir : CSP en bloquant, viewport user-scalable WCAG |
| ⚖️ Légal | **6.8** | CGU/CGV/Confidentialité solides. Mentions légales TODO bloquant. Cookies banner conforme sauf hiérarchie. Pas de DPIA |
| 💰 Cost | **8.0** | Free/Hobby tient 3-12 mois. Aucun cron purge → bloat à venir. Cleanup storage orphelin urgent |
| ⚡ Perf | **7.4** | TTFB home 68ms ✅. Bundle JS critique 410KB sur home. 4 anti-patterns SQL détectés (`/annonces` listing client-side filter). 5 indexes manquants |
| 🩺 Health | **7.5** | Cert valide 74j, /api/health OK, 0 broken links sur 10 routes testées, SEO baseline OK. Description home > 160 chars |

---

## TOP 5 CRITIQUES — À FIX MAINTENANT

> Bloquants paid launch. Ordre d'exécution recommandé.

### 🔴 1. Mentions légales TODO (LCEN art. 6-III)
**Source** : [06-legal-fr.md](./06-legal-fr.md)
**Issue** : SIRET / RCS / capital / siège marqués "à compléter".
**Risque** : 1 an emprisonnement + 75k€ amende.
**Effort** : **1h** — décider statut juridique (entrepreneur individuel vs SAS) puis remplir le template existant.
**Décision préalable user** : "Paul Sadrant entrepreneur individuel" (immédiat, pas d'INPI requis) OU "SAS en cours d'immatriculation" (4-6 sem).

### 🔴 2. DPIA RGPD absente + registre des traitements (Art. 30 + 35)
**Source** : [05-rgpd-audit.md](./05-rgpd-audit.md)
**Issue** : Plateforme traitant CNI + fiches paie + IBAN + scoring locataire = traitement à risque élevé. DPIA obligatoire. Registre Art. 30 obligatoire.
**Effort** : **2j** — template DPIA CNIL + registre Excel/Notion. Pas urgent en beta gratuite, **bloquant paid launch**.

### 🔴 3. Banner cookies — hiérarchie boutons (CNIL 2020)
**Source** : [06-legal-fr.md](./06-legal-fr.md)
**Issue** : `CookieBanner.tsx:326-344` — "Tout refuser" en lien souligné gris vs "Tout accepter" en bouton noir plein. Délibération CNIL 2020 violée.
**Risque** : amende similaire à Google 150M€ (proportionnelle).
**Effort** : **15 min** — équilibrer les 2 boutons (même style/taille).

### 🔴 4. Homepage `/` en `"use client"` total
**Source** : [01-seo-overview.md](./01-seo-overview.md) + [03-aeo-geo.md](./03-aeo-geo.md)
**Issue** : `app/page.tsx` est full client component → ChatGPT/Perplexity reçoivent un HTML quasi-vide. Pas de `generateMetadata`. Impact SEO direct.
**Effort** : **3-4h** — split en `HeroSSR` (server) + `HeroInteractif` (client). Ajouter `generateMetadata` dynamique.

### 🔴 5. `og-default.png` référencé mais absent
**Source** : [01-seo-overview.md](./01-seo-overview.md) + [11-site-health.md](./11-site-health.md)
**Issue** : `app/layout.tsx:116` référence `/og-default.png` mais le fichier n'existe pas dans `nestmatch/public/`. Tous partages sociaux (Twitter, LinkedIn, WhatsApp, FB) retournent image 404.
**Effort** : **30 min** — créer une image 1200x630 PNG conforme OG + déposer dans `public/`.

---

## TOP 10 IMPORTANTS

### Ordre par ROI (impact / effort)

| # | Action | Source | Effort | Impact |
|---|--------|--------|--------|--------|
| 6 | Cron `purge-housekeeping` (notifs/messages/dossier_access_log) | [09-supabase-cost.md](./09-supabase-cost.md) | 1h | Stop DB bloat |
| 7 | List-Unsubscribe + One-Click headers Resend (Gmail/Yahoo bulk 2024) | [07-email-deliverability.md](./07-email-deliverability.md) | 30 min | Délivrabilité Gmail |
| 8 | `app/llms.txt/route.ts` (proposed standard 2025) | [03-aeo-geo.md](./03-aeo-geo.md) | 30 min | Citabilité IA-search |
| 9 | Robots.txt — explicit AI bots (Option 1 : autoriser sur public) | [03-aeo-geo.md](./03-aeo-geo.md) | 15 min | Crawl IA |
| 10 | `generateMetadata` sur `/annonces` (avec `?ville=`) | [01-seo-overview.md](./01-seo-overview.md) | 1h | SEO listing |
| 11 | `noindex` sur `/location/[ville]` avec 0 annonce active | [04-location-pages-status.md](./04-location-pages-status.md) | 1h | Anti-doorway Google |
| 12 | Storage cleanup orphelins (`annonces-photos`, `baux-pdf`) | [09-supabase-cost.md](./09-supabase-cost.md) | 2h | Stop storage gonflé |
| 13 | Open Graph immo (`property:price:amount`, `property:bedrooms`, `property:area:size`) | [02-schema-real-estate.md](./02-schema-real-estate.md) | 1h | Rich snippets immo |
| 14 | DMARC `p=quarantine` + `rua` reporting | [07-email-deliverability.md](./07-email-deliverability.md) | 30 min DNS | Sécurité brand |
| 15 | Webhook Resend bounces/complaints | [07-email-deliverability.md](./07-email-deliverability.md) | 2h | Réputation IP |

---

## BACKLOG (V71+)

### SEO/Marketing
- 16. Direct answer block sur `/` (1 paragraphe-réponse en haut, AI Overviews-friendly)
- 17. `<time datetime>` + "Page mise à jour le …" sur fiches annonce + landing villes
- 18. Person schema founder + Organization.sameAs peuplé (LinkedIn, Wikidata)
- 19. Phase A hardening location pages (hreflang, Place schema, notFound, blocs uniques 300+)
- 20. Phase B Top 15 villes Tier 1 manquantes (Le Mans, Cergy, Mérignac…)
- 21. Phase C arrondissements Paris/Lyon/Marseille (45 sous-routes — volume 1.2M searches/mois)

### Légal
- 22. Médiateur de la consommation agréé (CGU + CGV — L612-1)
- 23. Bail mobilité loi ELAN 2018 — mention dédiée
- 24. DPO désigné (privacy@keymatch-immo.fr déjà alias)
- 25. DSA UE 2022/2065 — évaluer si KeyMatch = plateforme intermédiaire concernée

### Tech / Perf
- 26. Migration 063 — 5 indexes recommandés (cf [10-sql-perf.md](./10-sql-perf.md))
- 27. Cleanup ~10 indexes doublons (mig 006 vs 010) après `pg_stat_user_indexes` audit
- 28. Refactor `/messages/page.tsx` (3605 lignes monolithique) en sous-composants
- 29. Consolidation crons Vercel (14 → 4-5 méta-crons) — Hobby limite 2 crons/projet
- 30. Photos Supabase : décider "Vercel image opt vs URL directe" (-50% transformations)
- 31. Cleanup double-Fraunces (next/font + @import 22 fichiers)
- 32. Compression photos client-side avant upload (-50% egress in)

### Email
- 33. Logo SVG inline → PNG hébergé (Outlook desktop compat)
- 34. Throttle crons emails (rate-limit Resend)

### Health
- 35. CSP en mode bloquant (actuellement Report-Only)
- 36. Bundle JS 4272 (Leaflet/MapLibre) en lazy load
- 37. viewport sans `user-scalable=no` (WCAG 1.4.4)
- 38. `/annonces` query Supabase à profiler (1.7s total)
- 39. Description home 162→158 chars

### RGPD
- 40. Export portabilité complet (zip messages + candidatures + visites + dossier — Art. 15+20)
- 41. Consent persisté DB (pas seulement localStorage — opposabilité)
- 42. Cron purge `dossier_access_log` (politique 90j déjà fonction SQL, jamais appelée)
- 43. `/api/account/delete` : ajouter Storage cleanup (CNI/fiches paie/etc.) + 9 tables manquantes
- 44. Procédure incident-response 72h CNIL formalisée
- 45. Sentry + OVH + GitHub à ajouter dans liste sous-traitants politique conf

---

## TOP 3 ACTIONS IMMÉDIATES (cette semaine)

> "Effort minimal × impact maximal" — débloquer paid launch en quelques heures.

### 1. **Mentions légales — décision juridique + remplir TODO** (1h)
- Décide : entrepreneur individuel ou SAS en cours
- Si entrepreneur individuel : prends ton SIREN sur INPI (gratuit, 24h)
- Si SAS : prends rendez-vous notaire ou utilise plateforme type Captain Contrat / Legalstart (~150-300€)
- **Output** : page `/mentions-legales` complétée, 0 TODO restant

### 2. **og-default.png + banner cookies équilibre** (45 min)
- Crée `/og-default.png` 1200x630 (Figma/Canva, exporte PNG <300KB)
- Dépose dans `nestmatch/public/og-default.png`
- Edit `CookieBanner.tsx:326-344` : aligne styles "Tout refuser" et "Tout accepter" (même padding, font-size, background-style)

### 3. **List-Unsubscribe + DMARC `rua`** (45 min)
- Ajoute headers `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` dans `lib/email/resend.ts`
- DNS : ajoute `rua=mailto:dmarc-reports@keymatch-immo.fr` à `_dmarc.keymatch-immo.fr`
- **Output** : Délivrabilité Gmail/Yahoo bulk sender 2024 ✅

**Total : ~2h30 → 3 blockers résolus, score global passe 72 → 82.**

---

## Méthodologie

11 audits exécutés en 3 batches parallèles :
- **Batch A** : SEO + Schema + AEO/GEO + Location + RGPD (read-only code)
- **Batch B** : Légal FR + Email + Vercel + Supabase
- **Batch C** : SQL perf + Site Health (live curl/WebFetch sur keymatch-immo.fr)

Chaque agent a lu sa propre définition dans `.claude/agents/{name}.md` et l'a appliquée.

Aucun fix appliqué dans cette session — V71+ après lecture user des rapports.
