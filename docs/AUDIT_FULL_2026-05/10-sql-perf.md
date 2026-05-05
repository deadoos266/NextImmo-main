# SQL Query Optimization Audit — 2026-05-06

Auditeur : agent `sql-query-optimizer` (Claude Opus 4.7)
Mode : read-only, audit pré-scaling KeyMatch.
Scope analysé : `nestmatch/app/api/**/route.ts` (~95 routes), `nestmatch/lib/**/*.ts`, `nestmatch/supabase/migrations/*.sql` (54 migrations), `nestmatch/lib/agents/*.ts`.

---

## Score global : **74 / 100**

KeyMatch a un état solide pour une stack solo : les indexes B-tree de base sont en place (mig 010), tables critiques REVOKE anon (RLS Phase 5 zéro overhead), routes API server-side avec `supabaseAdmin`. Mais plusieurs routes "chaudes" (messages, dashboard, listings) tirent encore `select("*")` ou ont des stratégies de scan non scalables (no LIMIT, OFFSET-based, OR sur table `messages` non couvert par index composite, full-fetch profils côté admin).

Ventilation :
- Foundations indexes : 18/20 (mig 010 + 054 + 056 + 062 couvrent l'essentiel)
- Cleanliness queries (over-fetching, limits, listings) : 12/20
- Anti-pattern N+1 / round-trips : 14/20
- Aggregations / RLS / pagination future-proof : 13/20
- Cron jobs scaling (loyers, post-bail, messages-digest) : 17/20

---

## Détail par anti-pattern

### 1. N+1 queries — **6 occurrences**

| Site | Pattern |
|---|---|
| `nestmatch/app/api/cron/loyers-retard/route.ts:112-117` | Loop sur tous les loyers en retard, 1 fetch `profils` par locataire pour récupérer prénom/nom. Si 200 loyers/mois en retard → 200 round-trips. |
| `nestmatch/app/api/cron/candidatures-digest/route.ts:108-117` | Loop interne `for (const c of list)` qui fait `supabase.from("profils").select("prenom, nom").eq("email", candidatEmail)` par candidat. |
| `nestmatch/app/api/cron/edl-contestation-retard/route.ts:121-135` | Pour chaque EDL contesté : 1 query annonce + 2 queries profils en parallèle (locataire + proprio). 30 EDL = 90 round-trips. |
| `nestmatch/app/api/cron/post-bail/route.ts:113-126` | Boucle sur `historique_baux` : pour chaque, 1 query profil locataire + 1 query annonces filtrées (matching). |
| `nestmatch/app/api/cron/depot-retard/route.ts:139-143` | Loop baux : 1 query profil locataire pour personnaliser email. |
| `nestmatch/lib/agents/sonnetAgent.ts:113-125` | Tool `calculate_matching_score` : 2 round-trips séquentiels (profil + annonce) au lieu d'un Promise.all. |

**Fix générique** : précharger un `Map` avec `.in("email", emails)` AVANT la boucle. Pattern déjà appliqué correctement dans `messages-digest` (ligne 143-150) et `loyers-retard` (mais oublié pour profils locataires) — il faut juste l'étendre.

### 2. Missing index — **3 occurrences réelles + 2 suspectes**

| Site | Pattern manquant |
|---|---|
| `cron/depot-retard/route.ts:88-95` | `WHERE bail_termine_at IS NOT NULL AND depot_restitue_at IS NULL AND caution > 0 AND notified_depot_retard_at IS NULL` — pas d'index composite. Sur 1k+ annonces avec partie loué_termine, full scan. |
| `cron/post-bail/route.ts:196-202` | Même chose : 4 conditions sur `annonces` (`bail_termine_at NOT NULL`, `depot_restitue_at IS NULL`, `caution > 0`, `bail_termine_at <= now-25j`). |
| `cron/preavis-jalons/route.ts:38-43` | `WHERE preavis_fin_calculee IS NOT NULL AND preavis_fin_calculee BETWEEN today AND horizon` — pas d'index sur `preavis_fin_calculee`. |
| `cron/irl-rappel-bail/route.ts:51-55` | `WHERE statut = 'loué' AND date_debut_bail IS NOT NULL` — `idx_annonces_statut` existe (mig 010) mais partial WHERE fait préférer un index dédié `(statut, date_debut_bail)`. |
| `messages` `eq("type", "candidature")` (`/api/notifications/candidats-orphelins`, `/proprietaire/stats/messages-counts`) | Index `idx_messages_statut_candidature` (mig 022) couvre `(to_email, annonce_id, statut_candidature) WHERE type='candidature'` — bon. Mais pour les usages globaux comme `cron/candidatures-digest` (`WHERE type='candidature' AND created_at >= now-24h`) : **pas couvert**. |

### 3. Sequential scan sur grandes tables (avec sort) — **4 occurrences critiques**

| Site | Détail |
|---|---|
| `app/annonces/AnnoncesClient.tsx:600-604` (page publique listing) | `from("annonces").select("*").or("statut.is.null,statut.neq.loué").eq("is_test", false)` : pas de LIMIT, pas de filtre ville côté DB initial. À 5k+ annonces actives = 800ms+ et payload énorme (`select("*")` = 60+ colonnes). Le filtrage ville/prix se fait CÔTÉ CLIENT — anti-pattern majeur. |
| `app/api/admin/dashboard/route.ts:32-44` | `from("annonces").select("*").order(...)` + `from("profils").select("*")` (sans WHERE) — full table scan + dump complet de tous les profils. Acceptable tant que <5k users mais à risque. |
| `app/api/messages/all-mine/route.ts:31-34` | `or("from_email.eq.X,to_email.eq.Y")` + `order("created_at" desc)` sans LIMIT. Postgres ne peut pas utiliser index `(to_email)` ET `(from_email)` simultanément sur `OR` → seq scan probable. À 1M messages, sera bloqué. |
| `app/api/admin/messages/route.ts:45-52` | Même pattern OR sur `messages` + `order("created_at")` — seq scan + sort full. |

### 4. ORDER BY + LIMIT sans index efficace — **3 occurrences**

| Site | Détail |
|---|---|
| `cron/messages-digest/route.ts:94-101` | `from("messages_emails_log").eq("receiver_email", X).not("last_digest_at","is",null).order("last_digest_at" desc).limit(1)` — l'index `idx_msg_emails_log_digest` existe mais est sur `(receiver_email, last_digest_at desc NULLS LAST)`. Le `not(... is null)` peut empêcher l'usage. À vérifier avec EXPLAIN. |
| `app/api/messages/last-by-prefix/route.ts:72-79` | `eq("annonce_id", X).ilike("contenu","prefix%").order("created_at" desc).limit(1)` — `idx_messages_annonce_id` couvre annonce_id mais pas le sort sur `created_at`. À petite échelle (<1k messages/annonce), OK. À l'échelle, dégradé. |
| `app/api/bail/card-payload/route.ts:50-56` | Même pattern que ci-dessus sur `[BAIL_CARD]%`. |

### 5. RLS overhead — **0 occurrence dans le code applicatif**

KeyMatch est passé en **RLS Phase 5 final** (mig 058/059/060/053) : `messages`, `loyers`, `etats_des_lieux`, `historique_baux`, `messages_emails_log` ont `REVOKE ALL FROM anon AND authenticated`. Tout passe via routes API server-side avec `supabaseAdmin` (service_role qui bypass RLS). **Zéro overhead policy par row.**

Reste à surveiller : `annonces`, `profils`, `visites`, `carnet_entretien` peuvent encore avoir des policies actives — mais l'audit du code montre que ces tables aussi sont accédées via supabaseAdmin server-side (ex `/api/profil/me`, `/api/annonces/...`). Le client direct restant (`AnnoncesClient.tsx`, `app/messages/page.tsx`, `app/proprietaire/page.tsx`) tape `annonces`, `visites`, `clics_annonces`, `conversation_preferences` avec la clé anon — si des policies restent, vérifier qu'elles n'ont pas de sub-select.

Action : grep `CREATE POLICY` dans migrations et auditer chaque policy pour subqueries lourdes (out-of-scope pour cet audit, mais à faire).

### 6. Pagination OFFSET — **0 occurrence**

KeyMatch n'utilise **jamais** `OFFSET` dans les queries Supabase. Bonne pratique implicite. Cependant, plusieurs routes loadent toute la collection et paginent côté client (`/messages/all-mine`, `/admin/dashboard`, `/annonces` listing) — équivalent moralement à un seq-scan sans LIMIT. À transformer en keyset pagination (`gt("created_at", lastSeen)`) avant de scaler à 100k+ rows.

### 7. Aggregations sans index — **2 occurrences**

| Site | Détail |
|---|---|
| `app/api/proprietaire/stats/messages-counts/route.ts:48-60` | 2× `count: "exact"` avec `eq("to_email", X).eq("annonce_id", Y).eq("type", "candidature")` ET `like("contenu", "[DOSSIER_CARD]%")`. Le 2e count fait un **filtre LIKE non-anchored** (mais `[DOSSIER_CARD]%` est ancré au début donc B-tree-friendly). Couvert partiellement par `idx_messages_statut_candidature` mais pas optimal. |
| `app/api/messages/unread-count/route.ts:31-35` | `count: "exact"` avec `eq("to_email", X).eq("lu", false)` — couvert par `idx_messages_unread` partial (mig 010). **OK.** |

---

## Top 10 queries problématiques

### #1 (CRITIQUE) — Listing public `/annonces`

**Fichier** : `nestmatch/app/annonces/AnnoncesClient.tsx:600-604`
**Pattern** : Sequential scan + over-fetching + filtrage client
```ts
await supabase.from("annonces").select("*").or("statut.is.null,statut.neq.loué").eq("is_test", false)
```
- Zéro LIMIT → renvoie TOUT. À 1k annonces ≈ 1-2 MB de payload. À 10k = 10-20 MB.
- `select("*")` tire les 60+ colonnes (incluant photos jsonb, charges, mensualite_credit, valeur_bien, taxe_fonciere, assurance_pno, charges_copro_annuelles, locataire_email, etc.) dont 80% inutiles pour la card.
- Filtrage ville/prix/surface fait `.filter()` côté React — invisible côté DB.

**Fix proposé** :
1. Migration vers `/api/annonces/list` server-side avec query params `?ville=Paris&prix_max=1500&pieces_min=2&limit=50&offset=0`.
2. Sélectionner uniquement les colonnes affichées sur la card (`id, titre, ville, prix, charges, surface, pieces, meuble, dpe, photos, lat, lng, statut, created_at`).
3. Keyset pagination via `id desc` (déjà indexé via PK).

**Impact estimé** : payload -85% (200 KB vs 2 MB), TTFB -60% (300ms vs 800ms à 1k annonces). Avec 10k annonces, c'est la différence entre 100ms et 6s.

### #2 (CRITIQUE) — `/api/admin/dashboard`

**Fichier** : `nestmatch/app/api/admin/dashboard/route.ts:32-44`
**Pattern** : Full table scan x4 sans LIMIT/projection
```ts
supabaseAdmin.from("annonces").select("*").order("id", { ascending: false })
supabaseAdmin.from("profils").select("*")  // 60 colonnes incluant dossier_docs (CNI/fiches paie, gros JSONB)
supabaseAdmin.from("users").select("...").order("created_at" desc)
supabaseAdmin.from("messages").select("*").order("created_at" desc).limit(100)  // OK
```
- `profils.dossier_docs` peut peser 200 KB+ par row (CNI photo, fiches paie). À 1000 users = 200 MB de payload côté admin. **Bloque le dashboard à 5k users.**
- Aucun LIMIT sur annonces/profils/users.

**Fix** :
1. Pagination `?cursor=ID&limit=100` côté admin.
2. `select("email, prenom, nom, is_proprietaire, is_admin, created_at")` — **JAMAIS** dossier_docs ici (afficher les détails sur clic uniquement).
3. Ajouter LIMIT 200 par défaut sur annonces et users (admin paginate ensuite).

**Impact estimé** : 80% reduction reads, 95% reduction payload. Dashboard de 5s → 300ms.

### #3 (CRITIQUE) — `/api/messages/all-mine`

**Fichier** : `nestmatch/app/api/messages/all-mine/route.ts:31-35`
**Pattern** : OR clause non-couvert par index, no LIMIT
```ts
.or(`from_email.eq.${me},to_email.eq.${me}`).order("created_at", { ascending: false })
```
- Postgres ne peut utiliser qu'**un seul** index pour un OR. Soit `idx_messages_to_email`, soit `idx_messages_from_email` — l'autre branche fait un seq scan.
- Pas de LIMIT → un user actif depuis 1 an avec 5k messages = 5k rows tirées + sort.
- Le client (`/messages` page) re-groupe ensuite côté JS — anti-pattern.

**Fix** :
1. **Solution A** (recommandée) : créer un index multi-colonnes ou utiliser deux queries en parallèle (`Promise.all`) avec UNION côté JS — Postgres optimise mieux 2 index scans qu'un OR.
2. **Solution B** (long terme) : créer une vue matérialisée `messages_conversations` agrégée (1 row par paire from/to/annonce_id avec last_message_at). Refresh trigger.
3. Ajouter `.limit(500)` immédiat (un user n'a pas besoin de plus côté UI — keyset pagination ensuite).

**Impact estimé** : x10 (40ms vs 400ms) à 100k messages avec solution A.

### #4 (CRITIQUE) — Listing `/proprietaire` page

**Fichier** : `nestmatch/app/proprietaire/page.tsx:553-562, 566`
**Pattern** : `select("*")` x3 + fallback full-scan
```ts
supabase.from("annonces").select("*").in("proprietaire_email", variants).order("id", { ascending: false })
supabase.from("visites").select("*").in("proprietaire_email", variants).order("id", { ascending: false })
// Fallback si vide :
supabase.from("annonces").select("*").order("id", { ascending: false }).limit(500)
```
- Le fallback à la ligne 566 charge **les 500 dernières annonces de tout le monde** pour ensuite filtrer côté client par `proprietaire_email`. **Fuite de payload** + N+1 conceptuel (charge tout pour utiliser 1%). Et exposé en client direct (clé anon).
- `select("*")` partout.

**Fix** :
1. Supprimer le fallback (l'utiliser comme sentinelle d'erreur, pas comme stratégie principale).
2. Sélectionner les colonnes affichées sur la card proprio uniquement.
3. Délégation server-side via `/api/proprietaire/list` (et profite-en pour passer en RLS Phase 5 sur annonces/visites client direct).

**Impact estimé** : -70% bandwidth, -50% TTFB.

### #5 (WARNING) — N+1 dans `cron/loyers-retard`

**Fichier** : `nestmatch/app/api/cron/loyers-retard/route.ts:112-117`
**Pattern** : 1 fetch profil par loyer en retard
```ts
for (const l of loyers) {
  const { data: locProf } = await supabaseAdmin.from("profils")
    .select("prenom, nom").eq("email", locEmail).maybeSingle()
}
```
À 50 loyers en retard / mois ≈ 50 round-trips série. Chaque round-trip Supabase ~30ms = 1.5s ajoutés au cron.

**Fix** : précharger une `Map<email, {prenom, nom}>` via `.in("email", uniqueLocataireEmails)` AVANT la boucle. Pattern déjà fait pour annonces lignes 70-80. Juste à dupliquer.

**Impact estimé** : cron job 1.5s → 100ms.

### #6 (WARNING) — N+1 dans `cron/candidatures-digest`

**Fichier** : `nestmatch/app/api/cron/candidatures-digest/route.ts:108-117`
**Pattern** : 1 fetch profil par candidat
```ts
for (const c of list) {
  const { data: candProf } = await supabaseAdmin.from("profils")
    .select("prenom, nom").eq("email", candidatEmail).maybeSingle()
}
```
Sur un cron qui traite 100 candidatures dans un digest → 100 round-trips séquentiels (~3s pure I/O).

**Fix** : pre-fetch en bulk via `.in("email", uniqueCandidatEmails)`.

**Impact estimé** : 3s → 50ms (x60).

### #7 (WARNING) — N+1 dans `cron/edl-contestation-retard`

**Fichier** : `nestmatch/app/api/cron/edl-contestation-retard/route.ts:120-135`
**Pattern** : Pour chaque EDL contesté → 1 query annonce + 2 queries profils.

**Fix** : préchargement via 2 `.in()` (annonceIds, emails uniques), puis Map lookups.

**Impact estimé** : 30 EDLs → 90 round-trips → 3 round-trips. Cron de 3s → 200ms.

### #8 (WARNING) — Index manquant pour `cron/depot-retard`

**Fichier** : `nestmatch/app/api/cron/depot-retard/route.ts:88-95`
**Pattern** :
```ts
.not("bail_termine_at", "is", null)
.is("depot_restitue_at", null)
.gt("caution", 0)
.is("notified_depot_retard_at", null)
.limit(200)
```
4 colonnes filtrées sans index composite. Sur `annonces` qui contient TOUS les biens (actifs + clos), à 10k rows ce sera un seq scan.

**Fix** : créer un index partiel ciblé :
```sql
CREATE INDEX idx_annonces_depot_a_traiter
  ON public.annonces(bail_termine_at)
  WHERE bail_termine_at IS NOT NULL
    AND depot_restitue_at IS NULL
    AND notified_depot_retard_at IS NULL;
```
Index ultra-mince (uniquement les baux actuellement en attente de restitution = quelques dizaines max) → cron quasi-instantané.

**Impact estimé** : 500ms → 5ms (x100).

### #9 (WARNING) — Index manquant pour `cron/preavis-jalons`

**Fichier** : `nestmatch/app/api/cron/preavis-jalons/route.ts:38-43`
**Pattern** : `WHERE preavis_fin_calculee BETWEEN today AND today+35j`. Aucun index sur `preavis_fin_calculee`.

**Fix** :
```sql
CREATE INDEX idx_annonces_preavis_fin
  ON public.annonces(preavis_fin_calculee)
  WHERE preavis_fin_calculee IS NOT NULL;
```

**Impact estimé** : 200ms → 10ms.

### #10 (INFO) — Index trop nombreux et redondants sur messages/annonces

**Fichier** : `nestmatch/supabase/migrations/006_gestion_documentaire.sql` ET `010_indexes_performance.sql`
**Détail** : doublons d'indexes :
- `messages_annonce_idx` (mig 006) ET `idx_messages_annonce_id` (mig 010) — partial WHERE non-null vs non-partial — quasi-équivalent.
- `messages_from_idx` ET `idx_messages_from_email` — strictement équivalents.
- `messages_to_idx` ET `idx_messages_to_email` — strictement équivalents.
- `annonces_proprio_idx` ET `idx_annonces_proprietaire` — strictement équivalents.
- `annonces_locataire_idx` (partial) ET `idx_annonces_locataire` (full) — chevauchement.

Cela alourdit les writes (chaque INSERT/UPDATE doit maintenir tous ces indexes) et consomme de la storage (chaque index sur `messages` à 1M rows = 50-100 MB).

**Fix** : DROP les doublons :
```sql
DROP INDEX IF EXISTS public.messages_annonce_idx;
DROP INDEX IF EXISTS public.messages_from_idx;
DROP INDEX IF EXISTS public.messages_to_idx;
DROP INDEX IF EXISTS public.annonces_proprio_idx;
DROP INDEX IF EXISTS public.annonces_locataire_idx;
DROP INDEX IF EXISTS public.loyers_annonce_idx;
DROP INDEX IF EXISTS public.loyers_proprio_idx;
DROP INDEX IF EXISTS public.loyers_locataire_idx;
DROP INDEX IF EXISTS public.edl_locataire_idx;
DROP INDEX IF EXISTS public.edl_proprio_idx;
```

**Impact estimé** : -200 MB storage à 1M messages, +10% sur INSERT messages (moins d'indexes à maintenir).

---

## Indexes recommandés (CREATE INDEX prêts à coller)

```sql
-- Migration 063_query_optimizer_indexes.sql
-- Author: sql-query-optimizer (audit 2026-05-06)
-- Status: READY TO APPLY

BEGIN;

-- ─── 1. Cron depot-retard / post-bail (anti-pattern #8 + scan #2) ──────────
-- Cible : baux en attente de restitution dépôt. Index partial mince (~10-100 rows).
CREATE INDEX IF NOT EXISTS idx_annonces_depot_a_traiter
  ON public.annonces(bail_termine_at)
  WHERE bail_termine_at IS NOT NULL
    AND depot_restitue_at IS NULL;

-- Variante ciblée pour `cron/depot-retard` qui exclut les déjà-notifiés :
CREATE INDEX IF NOT EXISTS idx_annonces_depot_retard_pending
  ON public.annonces(bail_termine_at)
  WHERE bail_termine_at IS NOT NULL
    AND depot_restitue_at IS NULL
    AND notified_depot_retard_at IS NULL;

-- ─── 2. Cron preavis-jalons (anti-pattern #9) ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_annonces_preavis_fin
  ON public.annonces(preavis_fin_calculee)
  WHERE preavis_fin_calculee IS NOT NULL;

-- ─── 3. Cron irl-rappel-bail ───────────────────────────────────────────────
-- Loop sur tous les bails actifs avec date_debut_bail.
CREATE INDEX IF NOT EXISTS idx_annonces_loue_avec_date_debut
  ON public.annonces(date_debut_bail)
  WHERE statut = 'loué' AND date_debut_bail IS NOT NULL;

-- ─── 4. Cron candidatures-digest (anti-pattern type 'candidature' global) ──
-- WHERE type = 'candidature' AND created_at >= now-24h.
CREATE INDEX IF NOT EXISTS idx_messages_candidature_created
  ON public.messages(created_at DESC)
  WHERE type = 'candidature';

-- ─── 5. Préfixes système (BAIL_CARD, DOSSIER_CARD, etc.) ───────────────────
-- Patterns: ilike("contenu", "[BAIL_CARD]%") + eq("annonce_id", X) + order created_at desc + limit 1.
-- B-tree text_pattern_ops permet le LIKE prefix.
CREATE INDEX IF NOT EXISTS idx_messages_annonce_contenu_prefix
  ON public.messages(annonce_id, contenu text_pattern_ops, created_at DESC)
  WHERE contenu LIKE '[%';

-- ─── 6. messages_emails_log digest lookup ──────────────────────────────────
-- WHERE receiver_email = X AND last_digest_at IS NOT NULL ORDER BY last_digest_at DESC LIMIT 1.
-- L'index existant est partial NULLS LAST mais le NOT IS NULL le rend ambigu.
-- Index dédié plus court :
CREATE INDEX IF NOT EXISTS idx_msg_emails_log_digest_only
  ON public.messages_emails_log(receiver_email, last_digest_at DESC)
  WHERE last_digest_at IS NOT NULL;

-- ─── 7. ANALYZE pour rafraîchir les stats ──────────────────────────────────
ANALYZE public.annonces;
ANALYZE public.messages;
ANALYZE public.messages_emails_log;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── 8. (Optionnel) Cleanup doublons anciens — À VALIDER MANUELLEMENT ──────
-- Avant d'appliquer, vérifier avec SELECT pg_size_pretty(pg_relation_size(indexname::regclass)) sur chaque
-- pour s'assurer de l'utilité réelle. Les indexes "mig 006" sont quasi-équivalents
-- aux "mig 010" mais certains sont partials.
-- DROP INDEX IF EXISTS public.messages_annonce_idx;       -- doublon idx_messages_annonce_id
-- DROP INDEX IF EXISTS public.messages_from_idx;          -- doublon idx_messages_from_email
-- DROP INDEX IF EXISTS public.messages_to_idx;            -- doublon idx_messages_to_email
-- DROP INDEX IF EXISTS public.annonces_proprio_idx;       -- doublon idx_annonces_proprietaire
-- DROP INDEX IF EXISTS public.loyers_annonce_idx;         -- doublon idx_loyers_annonce
-- DROP INDEX IF EXISTS public.loyers_locataire_idx;       -- doublon idx_loyers_locataire
-- DROP INDEX IF EXISTS public.edl_locataire_idx;          -- doublon idx_edl_locataire
-- DROP INDEX IF EXISTS public.edl_proprio_idx;            -- doublon idx_edl_proprietaire
```

---

## Recommandations priorisées (par ROI)

1. **AVANT 1k annonces actives** : refactorer `/annonces` listing (anti-pattern #1) — c'est la page publique la plus chaude. Délégation server-side avec query params + LIMIT.
2. **AVANT scaling messages > 100k** : appliquer indexes #4-#5 (`idx_messages_candidature_created`, `idx_messages_annonce_contenu_prefix`) + retravailler `/api/messages/all-mine` pour 2 queries Promise.all + LIMIT 500.
3. **CRON nightly** : appliquer index #1, #2, #3 (`idx_annonces_depot_*`, `idx_annonces_preavis_fin`, `idx_annonces_loue_avec_date_debut`). Faible coût migration, x10-x100 cron speed.
4. **N+1 cron loyers/candidatures/edl** : préchargement en `.in()` (5 fichiers à patch, 30 min de boulot, gain 3-5s par cron).
5. **Admin dashboard** : pagination + projection pour ne pas charger les `dossier_docs`. Bloquant à 5k+ users.
6. **NETTOYAGE** : DROP des indexes doublons après audit `pg_stat_user_indexes` pour confirmer non-utilisés.

---

## Stats brutes

- **Routes API analysées** : 95
- **Helpers lib analysés** : 6 (auth, profilClient, notifications, visitesHelpers, agents/sonnetAgent, bail/finalize)
- **Migrations analysées** : 54 (000 → 062)
- **Indexes existants détectés** : 51 (B-tree + 5 partials + 1 GIN sur `notif_preferences`)
- **Tables principales** : annonces (~26 cols + 60 si historique), profils (~50 cols), messages (~10 cols), loyers, etats_des_lieux, visites, carnet_entretien, notifications, historique_baux, bail_invitations, bail_avenants, bail_signatures, edl_signatures, favoris, recherches_sauvegardees, dossier_share_tokens, dossier_access_log, messages_emails_log, irl_history, signalements, contacts, clics_annonces, users.
- **RPC fonctions custom** : 0 (aucun `supabase.rpc(...)` détecté).
- **Patterns dangereux confirmés** : 4 critiques + 4 warnings + 2 infos.
- **Estimation gain global après application des fixes top 5** : -60% TTFB pages chaudes, -80% temps cron jobs, x10 capacité messages avant refacto pagination.
