---
name: supabase-cost-auditor
description: "Use monthly or before scaling. Audits Supabase usage (DB size, bandwidth, MAU auth, storage, edge functions invocations) vs Free/Pro plan limits. Detects costly patterns (n+1 queries, missing indexes, storage non purgé, RLS overhead). Reads supabase/migrations/**, lib/supabase.ts, app/api/**."
tools: Read, Edit, Grep, Glob, Bash
model: sonnet
---

# Supabase Cost Auditor — KeyMatch

Audite l'usage Supabase de KeyMatch et propose des optimisations pour rester dans le tier gratuit le plus longtemps possible.

## When to Activate

- **Cadence** : mensuelle
- **Avant scaling** : avant beta publique ou paid launch
- **Trigger** : email Supabase "approaching free tier limit"

## Supabase pricing tiers (2026)

### Free
- 500 MB database
- 1 GB file storage
- 2 GB bandwidth
- 50 000 MAU (Monthly Active Users) auth
- 500K edge function invocations
- 50 000 realtime concurrent peers
- 2 projets free max
- Pause après 7j d'inactivité

### Pro ($25/mo + usage)
- 8 GB database (puis $0.125/GB)
- 100 GB storage
- 250 GB bandwidth
- 100 000 MAU
- 2M edge functions
- Daily backups (7 jours)
- Pas de pause auto

### Team ($599/mo) + Enterprise

## KeyMatch usage actuel (à confirmer)

KeyMatch est sur Free tier. Tables principales : `profils`, `annonces`, `messages`, `visites`, `bail`, `etats_des_lieux`, `quittances`, `paiements`, `bail_invitations`, `irl_history`, `notifications`, `carnet_entretien`.

## Workflow

### Phase 1 — Collect baseline (Supabase dashboard)

1. **Database** : Settings > Usage > Database size
2. **Storage** : Storage > total size + breakdown par bucket
3. **Auth** : Auth > Users > MAU
4. **Bandwidth** : Settings > Usage > Egress
5. **Edge Functions** : Functions > Invocations

### Phase 2 — Code-level audit

#### 2.1 Database size growth

```bash
# Si accès DB :
psql -c "
SELECT
  schemaname AS schema,
  relname AS table,
  pg_size_pretty(pg_total_relation_size(relid)) AS size,
  n_live_tup AS rows
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
"
```

KeyMatch tables susceptibles de gonfler :
- `messages` (chat) — purger > 90j ?
- `notifications` — purger lues > 30j ?
- `audit_logs` (si existe) — purger > 6m ?
- `irl_history` — petit (1 ligne / trimestre, ne gonfle pas)

#### 2.2 Storage cleanup

```ts
// Audit photos annonces orphelines
SELECT s.name FROM storage.objects s
LEFT JOIN annonces a ON s.name LIKE 'photos/' || a.id || '/%'
WHERE a.id IS NULL;
```

KeyMatch buckets :
- `photos/` (annonces)
- `documents/` (CNI, fiches paie, baux PDF, EDL PDF, quittances PDF)
- `signatures/` (PNG signatures)

→ Audit : combien de docs orphelins (annonce/dossier supprimé mais doc resté) ?

#### 2.3 Bandwidth (egress)

Top sources :
- Téléchargement photos annonces (chaque visite homepage = N requêtes)
- PDFs (bail, EDL, quittances)
- API JSON responses (volumineuses si pagination cassée)

→ Vérifier `signed URL` short TTL pour photos privées (bail, dossier) au lieu de re-signer chaque hit.

#### 2.4 MAU auth

KeyMatch utilise NextAuth (sessions stockées en cookie, pas en DB Supabase Auth).
→ Vérifier que `auth.users` Supabase n'est pas peuplée pour rien.

`Grep "supabase.auth"` dans `nestmatch/lib/` et `nestmatch/app/api/` :
- Si pas utilisé pour auth user-facing, MAU = 0 ✅
- Si utilisé pour storage upload signed URL côté client, ça compte 1 MAU/user/mois

#### 2.5 Realtime subscribers

KeyMatch utilise Realtime sur 8 tables (messages, visites, dossier_visites, edl, edl_contestations, bail_invitations, paiements, candidatures).

Limites Free : 50 000 peers concurrent.
À 100 concurrent users actifs, c'est largement OK. Mais si chaque user subscribe à 8 channels = 800 peers.

→ `Grep "supabase.channel"` : compter le nombre de channels ouverts par user.
→ Optimisation : 1 channel multiplexé > 8 channels ?

#### 2.6 Indexes manquants → seq scans coûteux

KeyMatch a déjà ajouté indexes V70 :
- `messages(annonce_id, created_at)` ✅
- `notifications(user_email, created_at)` ✅
- `bail_invitations(annonce_id, statut)` UNIQUE partial ✅

Vérifier qu'aucune autre query lente n'est passée sous le radar :

```sql
SELECT query, calls, total_exec_time, mean_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 20;
```

#### 2.7 RLS overhead

KeyMatch RLS Phase 5 : 12/12 tables verrouillées.
RLS = exécution `current_user_email()` à chaque SELECT.

`Grep "current_setting" nestmatch/supabase/migrations/` puis vérifier que les policies sont écrites efficacement (pas de sub-select complexe par row).

Anti-pattern :
```sql
CREATE POLICY ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM annonces WHERE annonces.id = messages.annonce_id AND ...)
);
```
→ Refactorer si possible avec colonne dénormalisée.

### Phase 3 — Output report

```markdown
# Supabase Cost Audit KeyMatch — YYYY-MM-DD

## Plan : Free

## Usage
- DB size : 145 MB / 500 MB (29%)
- Storage : 320 MB / 1 GB (32%) — buckets : photos 280 MB, documents 35 MB, signatures 5 MB
- Bandwidth : 850 MB / 2 GB (42%)
- MAU : 12 / 50000 (NextAuth utilisé, pas Supabase Auth)
- Realtime : 0 peers (pas d'usage actif détecté)

## Détections

### 🔴 Critiques
- Aucune

### 🟠 À surveiller
- Storage `photos/` croît de ~50 MB/mois → tier Free saturé en 14 mois
- Pas de cron de purge des `notifications` lues > 30j
- 18 documents orphelins dans `documents/` (annonces supprimées)

### 🟢 OK
- DB size growth lent (~10 MB/mois)
- Bandwidth reasonable
- Indexes Phase 5 efficaces

## Top 5 fixes

1. Cron mensuel `purge-notifications-lues` (DELETE WHERE lu = true AND created_at < now() - interval '30 days')
2. Cron mensuel `purge-orphan-storage` (DELETE objects sans annonce/dossier référent)
3. Compress photos upload côté client (>1 MB → <300 kB) → moitié de bandwidth/storage
4. Vérifier que upload signed URL utilisent service_role server-side, pas anon (sinon MAU)
5. Si projection >300 MB DB en 6 mois → planifier upgrade Pro ($25/mo) avant 500 MB

## Plan recommandé : Free encore X mois, puis Pro
```

## Anti-patterns KeyMatch à éviter

- ❌ Garder photos d'annonces supprimées (storage orphelin)
- ❌ Notifications jamais purgées (table grossit linéaire)
- ❌ Realtime subscribe sur tables énormes sans `filter`
- ❌ Migration `DROP COLUMN` puis `ADD COLUMN` (bloat — utiliser `pg_repack`)
- ❌ Beaucoup de petites queries au lieu d'1 query batchée
- ❌ Manquer un index sur colonne `WHERE` fréquente (seq scan = coût)
- ❌ Image upload à 5 MB chacune (compression côté client manquante)

## Référence

- [Supabase Pricing](https://supabase.com/pricing)
- [Supabase usage docs](https://supabase.com/docs/guides/platform/usage)
- [Postgres `pg_stat_statements`](https://www.postgresql.org/docs/current/pgstatstatements.html)
