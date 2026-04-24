<!-- LIVRE 2026-01 -->
<!-- Evidence: migration 010_indexes_performance.sql -->

# PLAN — Review indexes Supabase sur colonnes de filtres

## 1. Contexte et objectif
Actuellement quelques indexes ont été posés (par exemple `idx_profils_situation_pro`, `idx_dossier_access_log_email`). Mais les requêtes lourdes (`/annonces` filtres ville+prix, `messages` par `annonce_id`, `visites` par `date_visite`) scannent probablement la table. Tient à 5k rows, explose à 50k. Audit des requêtes + ajout ciblé d'indexes via migration SQL propre.

## 2. Audit de l'existant

### Tables exposées + colonnes filtrées fréquemment

| Table | Colonnes filtrées | Index existant ? |
|---|---|---|
| `annonces` | `ville`, `prix`, `statut`, `dispo`, `proprietaire_email`, `locataire_email`, `type_bien` | À vérifier : `ville`, `statut` probablement pas indexés |
| `messages` | `from_email`, `to_email`, `annonce_id`, `lu`, `created_at` | Pas sûr. Peut-être `from_email`/`to_email` via FK implicite. |
| `visites` | `proprietaire_email`, `locataire_email`, `annonce_id`, `statut`, `date_visite` | Idem. |
| `loyers` | `annonce_id`, `locataire_email`, `mois`, `statut` | Idem. |
| `clics_annonces` | `annonce_id`, `email` | Likely unique (annonce_id, email). |
| `etats_des_lieux` | `annonce_id`, `locataire_email`, `proprietaire_email`, `statut` | À vérifier. |
| `carnet_entretien` | `annonce_id`, `proprietaire_email`, `locataire_email` | Idem. |
| `contacts` | `statut`, `email`, `created_at` | `idx_contacts_statut` + `idx_contacts_assigne_a` vus dans `lib/contacts.ts`. |
| `signalements` | `statut`, `type` | À vérifier. |
| `dossier_access_log` | `email` (index existe), `token_hash` (index existe), `accessed_at` | OK. |
| `profils` | `email` (PK), `situation_pro`, `ville_souhaitee` | 2 derniers indexés récemment. |

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/supabase/migrations/<timestamp>_indexes_performance.sql` | **NOUVEAU** | Migration qui crée les indexes manquants. |
| `nestmatch/INDEXES_BENCHMARK.md` | **NOUVEAU** | Avant/après benchmarks EXPLAIN ANALYZE sur requêtes clés. |

## 4. Migrations SQL (prête à run)

```sql
-- =============================================================================
-- <timestamp>_indexes_performance.sql
--
-- Audit des requêtes fréquentes → ajout indexes manquants.
-- Tous idempotents (IF NOT EXISTS).
-- =============================================================================

-- ─── annonces ────────────────────────────────────────────────────────────────
-- /annonces : filtre ville + prix + statut
CREATE INDEX IF NOT EXISTS idx_annonces_ville ON annonces(ville);
CREATE INDEX IF NOT EXISTS idx_annonces_statut ON annonces(statut);
CREATE INDEX IF NOT EXISTS idx_annonces_prix ON annonces(prix);
CREATE INDEX IF NOT EXISTS idx_annonces_proprietaire ON annonces(proprietaire_email);
CREATE INDEX IF NOT EXISTS idx_annonces_locataire ON annonces(locataire_email);
-- Index composite le plus utilisé : recherche publique (tous les non-loués filtrés par ville)
CREATE INDEX IF NOT EXISTS idx_annonces_ville_statut ON annonces(ville, statut) WHERE statut IS DISTINCT FROM 'loué';

-- ─── messages ────────────────────────────────────────────────────────────────
-- Accès typique : toutes les messages d'une conv (from, to, annonce_id)
CREATE INDEX IF NOT EXISTS idx_messages_to_email ON messages(to_email);
CREATE INDEX IF NOT EXISTS idx_messages_from_email ON messages(from_email);
CREATE INDEX IF NOT EXISTS idx_messages_annonce_id ON messages(annonce_id) WHERE annonce_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
-- Badge "non lu" : WHERE to_email = X AND lu = false
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(to_email) WHERE lu = false;

-- ─── visites ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_visites_proprietaire ON visites(proprietaire_email);
CREATE INDEX IF NOT EXISTS idx_visites_locataire ON visites(locataire_email);
CREATE INDEX IF NOT EXISTS idx_visites_annonce ON visites(annonce_id);
CREATE INDEX IF NOT EXISTS idx_visites_statut_date ON visites(statut, date_visite);

-- ─── loyers ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loyers_annonce ON loyers(annonce_id);
CREATE INDEX IF NOT EXISTS idx_loyers_locataire ON loyers(locataire_email);
CREATE INDEX IF NOT EXISTS idx_loyers_mois ON loyers(mois);
CREATE INDEX IF NOT EXISTS idx_loyers_statut ON loyers(statut);

-- ─── etats_des_lieux ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_edl_annonce ON etats_des_lieux(annonce_id);
CREATE INDEX IF NOT EXISTS idx_edl_locataire ON etats_des_lieux(locataire_email);
CREATE INDEX IF NOT EXISTS idx_edl_proprietaire ON etats_des_lieux(proprietaire_email);

-- ─── carnet_entretien ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_carnet_annonce ON carnet_entretien(annonce_id);
CREATE INDEX IF NOT EXISTS idx_carnet_proprietaire ON carnet_entretien(proprietaire_email);
CREATE INDEX IF NOT EXISTS idx_carnet_locataire ON carnet_entretien(locataire_email);

-- ─── clics_annonces ──────────────────────────────────────────────────────────
-- Normalement UNIQUE(annonce_id, email) → index automatique. Vérifier.
CREATE INDEX IF NOT EXISTS idx_clics_annonce ON clics_annonces(annonce_id);

-- ─── signalements ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_signalements_statut ON signalements(statut);
CREATE INDEX IF NOT EXISTS idx_signalements_type ON signalements(type);

-- ─── Reload schema PostgREST ─────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
```

## 5. Variables d'env
**Aucune**.

## 6. Dépendances
**Aucune**.

## 7. Étapes numérotées

### Bloc A — Baseline EXPLAIN ANALYZE (avant)
1. Dans Supabase SQL Editor (staging idéalement — sinon prod en heures creuses), lancer les requêtes typiques avec `EXPLAIN ANALYZE` :
    ```sql
    EXPLAIN ANALYZE SELECT * FROM annonces WHERE ville = 'Paris' AND (statut IS NULL OR statut != 'loué');
    EXPLAIN ANALYZE SELECT * FROM messages WHERE (from_email = 'x@y.com' OR to_email = 'x@y.com') AND annonce_id = 1 ORDER BY created_at DESC LIMIT 100;
    EXPLAIN ANALYZE SELECT * FROM visites WHERE locataire_email = 'x@y.com' AND statut IN ('proposée','confirmée');
    EXPLAIN ANALYZE SELECT * FROM loyers WHERE annonce_id = 1 ORDER BY mois DESC;
    EXPLAIN ANALYZE SELECT COUNT(*) FROM messages WHERE to_email = 'x@y.com' AND lu = false;
    ```
2. Noter pour chacune dans `INDEXES_BENCHMARK.md` :
    - Scan type (Seq Scan / Index Scan / Bitmap Heap Scan)
    - Execution time
    - Rows matched
    - Total cost

### Bloc B — Créer la migration
3. Si P0.2 (Supabase CLI) est fait :
    ```bash
    cd nestmatch
    npx supabase migration new indexes_performance
    ```
    → crée `supabase/migrations/<timestamp>_indexes_performance.sql`.
4. Copier le SQL de §4 dans ce fichier.
5. `npx supabase db diff` → vérifier que la migration ajoute les indexes attendus et rien d'autre.

### Bloc C — Apply sur staging
6. Si P0.3 fait (staging existe) :
    ```bash
    npm run db:push:staging
    ```
7. Re-run les `EXPLAIN ANALYZE` sur staging. **Noter les nouveaux temps** dans `INDEXES_BENCHMARK.md`.
8. Vérifier Scan type passé de `Seq Scan` à `Index Scan` sur les colonnes cibles.

### Bloc D — Apply sur prod
9. Si tout OK en staging :
    ```bash
    npm run db:push
    ```
10. Alternatif manuel : coller le SQL de §4 dans Supabase Dashboard → SQL Editor → Run (prod).
11. **⚠️ Horaire** : créer des indexes sur une table déjà pleine peut locker quelques secondes. Préférer la nuit / heures creuses si prod a > 100k rows. Sur MVP, < 10k rows → instantané, OK en journée.

### Bloc E — Vérif post-deploy
12. `NOTIFY pgrst, 'reload schema';` pour rafraîchir PostgREST.
13. Retester `/annonces` filtré, `/messages`, `/visites` côté UX — rien ne doit casser.
14. Ré-run `EXPLAIN ANALYZE` en prod pour confirmer l'usage des indexes.

### Bloc F — `ANALYZE` force-refresh
15. Postgres collecte les statistiques auto mais peut être à retard. Forcer :
    ```sql
    ANALYZE annonces;
    ANALYZE messages;
    ANALYZE visites;
    ANALYZE loyers;
    ANALYZE etats_des_lieux;
    ANALYZE carnet_entretien;
    ```
    → sans effet si faible volume, mais bon réflexe.

### Bloc G — Monitoring long terme
16. Supabase dashboard → Reports → Query Performance → activer si pas déjà.
17. Dans 2 semaines, revoir : quelles requêtes restent lentes ? Ajouter indexes si besoin.

## 8. Pièges connus

- **Indexes partiels** (`WHERE clause`) : très efficaces pour cas précis (ex : `WHERE lu = false` pour compteur non-lus). Mais Postgres ne les utilise que si la requête matche exactement la clause.
- **`idx_annonces_ville_statut`** avec WHERE `statut IS DISTINCT FROM 'loué'` : Postgres l'utilise si la query a la même condition. Vérifier dans `app/annonces/page.tsx` qu'on utilise bien `.or("statut.is.null,statut.neq.loué")`.
- **Over-indexing** : chaque index ralentit les INSERTs et prend du disque. Ne pas indexer à tout-va. Les 20-30 indexes listés couvrent 95 % des cas, pas plus.
- **`messages.created_at DESC`** : Postgres peut utiliser un index asc avec `ORDER BY DESC` dans les 2 sens. Pas besoin d'index descendant explicite.
- **Indexes existants potentiellement redondants** : si 002/003/004 ont déjà posé des indexes, certains de nos `CREATE INDEX IF NOT EXISTS` seront no-op. OK, idempotent.
- **Ne PAS indexer les colonnes à faible cardinalité seules** (ex : `lu` qui est TRUE/FALSE). Index partiel ou composite.
- **`bcrypt password_hash`** : ne PAS indexer. Jamais utilisé en filtre.
- **JSONB `dossier_docs`** : si filtrage dessus, envisager GIN index. Actuellement pas filtré → skip.

## 9. Checklist "c'est fini"

- [ ] `INDEXES_BENCHMARK.md` créé avec baseline (avant) et résultats (après).
- [ ] Migration `<timestamp>_indexes_performance.sql` commit.
- [ ] Apply sur staging OK, gains mesurés (Index Scan au lieu de Seq Scan sur requêtes clés).
- [ ] Apply sur prod OK.
- [ ] `EXPLAIN ANALYZE` sur `/annonces` filtrées ville+statut : temps < 10 ms sur 5k rows.
- [ ] Monitoring Supabase Query Performance activé.
- [ ] `NOTIFY pgrst, 'reload schema';` runné après migration.

---

**Plan prêt, OK pour Sonnet** avec précaution :

- ⚠️ **Bloc D (Apply prod)** : David doit **déclencher** manuellement (ou valider le timing). Sonnet peut préparer le SQL et run sur staging, mais le push prod = décision humaine.
