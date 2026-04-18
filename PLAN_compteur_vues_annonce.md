# PLAN — Compteur vues annonce visible (côté locataire + côté proprio)

## 1. Contexte et objectif
`clics_annonces` + requêtes server-side `/annonces/[id]` sont en place avec les pills "N personnes ont consulté ce bien" et "Plusieurs candidats déjà intéressés". Rendre ça plus visible (placement, visual weight) et ajouter côté proprio un vrai compteur détaillé (7 derniers jours, 30 jours, total) dans `/proprietaire/stats?id=X`.

## 2. Audit de l'existant

Backend présent :
- `clics_annonces (annonce_id, email, UNIQUE)` — un clic = 1 row unique par (annonce, email).
- `ViewTracker.tsx` client upsert au mount.
- `/annonces/[id]/page.tsx` fetch count total + nb candidatures via `messages.annonce_id`.
- Pill "X personnes ont consulté ce bien" affiché si ≥ 5.

Manque :
- **Pas de `created_at` dans `clics_annonces`** → impossible de fait "cette semaine" ou "ce mois". Besoin migration.
- Pas de courbe dans `/proprietaire/stats`.
- Pill actuelle discrète : seuil 5 trop bas visuellement.

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/supabase/migrations/<timestamp>_clics_annonces_timestamp.sql` | **NOUVEAU** | Ajoute `created_at` + index. |
| `nestmatch/app/annonces/[id]/ViewTracker.tsx` | MODIF | L'upsert doit conserver created_at premier clic (on_conflict do nothing plutôt que upsert). |
| `nestmatch/app/annonces/[id]/page.tsx` | MODIF | Pill plus visible + granularité "cette semaine". |
| `nestmatch/app/proprietaire/stats/page.tsx` | MODIF | Card détaillée vues par annonce : total, 7j, 30j + mini chart (optional Phase 2). |

## 4. Migrations SQL

```sql
-- <timestamp>_clics_annonces_timestamp.sql
ALTER TABLE IF EXISTS clics_annonces
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_clics_annonces_created_at ON clics_annonces(annonce_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
```

## 5. Variables d'env
**Aucune**.

## 6. Dépendances
**Aucune**.

## 7. Étapes numérotées

### Bloc A — Migration
1. `npx supabase migration new clics_annonces_timestamp` → coller §4.
2. Push staging + prod.

### Bloc B — Ajuster ViewTracker
3. Actuellement upsert `on_conflict=annonce_id,email`. Problème : si user revient 10× sur l'annonce, on upsert 10× et `created_at` reste celui du DEFAULT (initial insert) — OK.
4. Vérifier le code :
    ```ts
    supabase.from("clics_annonces").upsert(
      { annonce_id: annonceId, email: session.user.email },
      { onConflict: "annonce_id,email" }
    )
    ```
    → l'upsert avec on_conflict **n'écrase PAS** `created_at` puisqu'on ne le met pas dans le payload. Bon.
5. Alternative plus robuste : utiliser `insert` + `.onConflict().ignore()` pour ne rien faire si déjà présent :
    ```ts
    supabase.from("clics_annonces").insert(...).select().then(...)
    // Si 23505 unique violation → ignore
    ```

### Bloc C — Fiche annonce : pills plus visibles + fréquence
6. `/annonces/[id]/page.tsx` : remplacer la query actuelle par une plus riche :
    ```ts
    const [{ count: vuesTotal }, { count: vuesSemaine }, { count: candCount }] = await Promise.all([
      supabase.from("clics_annonces").select("annonce_id", { count: "exact", head: true }).eq("annonce_id", annonce.id),
      supabase.from("clics_annonces").select("annonce_id", { count: "exact", head: true })
        .eq("annonce_id", annonce.id)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("annonce_id", annonce.id),
    ])
    ```
7. Rendre les pills plus visibles :
    - Placer **au-dessus** de la description, visible sans scroll.
    - Utiliser icônes 👁️ / 👥 / 💬 (ou SVG propres).
    - Si `vuesSemaine >= 10` OU `candCount >= 3` → pills "chauds" en fond orange (`#fff7ed`) au lieu de bleu.

### Bloc D — `/proprietaire/stats` — détail par annonce
8. Ouvrir `app/proprietaire/stats/page.tsx`. Pour chaque bien, charger :
    ```ts
    // Par bien, 3 fetchs parallèles
    const [total, semaine, mois, clics7j] = await Promise.all([
      supabase.from("clics_annonces").select("email", { count: "exact", head: true }).eq("annonce_id", bienId),
      supabase.from("clics_annonces").select("email", { count: "exact", head: true }).eq("annonce_id", bienId).gte("created_at", since7d),
      supabase.from("clics_annonces").select("email", { count: "exact", head: true }).eq("annonce_id", bienId).gte("created_at", since30d),
      supabase.from("clics_annonces").select("created_at").eq("annonce_id", bienId).gte("created_at", since7d).order("created_at", { ascending: true }),
    ])
    ```
9. Afficher dans la card du bien :
    ```tsx
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 12 }}>
      <Stat label="Vues totales" value={total} />
      <Stat label="7 derniers jours" value={semaine} />
      <Stat label="30 derniers jours" value={mois} />
    </div>
    ```
10. Mini-bar chart 7 jours (SVG inline) :
    - Groupe `clics7j` par jour.
    - 7 barres avec hauteur proportionnelle.
    - Pas de lib externe.

### Bloc E — Badge "Tendance"
11. Si `vuesSemaine > 2× vuesSemainePrécédente` → badge vert "📈 En hausse".
12. Si `vuesSemaine == 0 && vuesTotal > 0` → badge gris "📉 Aucune vue cette semaine — rafraîchir l'annonce ?".

## 8. Pièges connus

- **Anon users** : `clics_annonces` stocke par email. Un anon (non connecté) ne trigger pas `ViewTracker` (car condition `session.user.email`). Donc le compteur = uniquement users connectés. OK pour commencer.
- **Storage limite free** : millions de rows = OK tant que < 500 MB. Chaque row ~100 bytes, donc 5M rows max. Largement.
- **Index `(annonce_id, created_at)`** créé par la migration — nécessaire pour `gte(created_at)` fast.
- **Concurrence upsert** : si 2 users cliquent simultanément, upsert OK. Pas de race.
- **Privacy** : on stocke `email` en clair. Côté proprio, on affiche juste un count → pas de leak. Si un jour on affiche "qui a vu", passer par hash email comme `dossier_access_log`.
- **Anciens rows sans created_at** : la migration pose DEFAULT now() → les anciennes lignes auront la date du moment de la migration. Pas d'historique rétroactif. Acceptable.
- **Tendance** : semaine précédente vs courante. Base buggy si volume faible (bruit statistique). Seuil minimum (ex : afficher tendance uniquement si baseline > 10).

## 9. Checklist "c'est fini"

- [ ] Migration `clics_annonces.created_at` appliquée.
- [ ] Fiche annonce : pills vues + candidats visibles au-dessus fold desktop.
- [ ] Pills deviennent "chauds" (orange) quand seuils dépassés.
- [ ] `/proprietaire/stats?id=X` : card par bien avec stats 3 périodes.
- [ ] Mini-bar chart 7 jours rendu sans lib externe.
- [ ] Badge "En hausse" / "Aucune vue" affiché selon seuils.
- [ ] Tests coverage `/annonces/[id]` inchangée.
- [ ] `tsc --noEmit` OK.

---

**Plan OK pour Sonnet.** Aucun bloc ⚠️ Opus-only : pure UI + requêtes count non-sensibles.
