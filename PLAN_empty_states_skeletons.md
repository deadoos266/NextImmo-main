# PLAN — Empty states + Skeletons généralisés

## 1. Contexte et objectif
Les primitifs `Skeleton` et `EmptyState` sont posés en Phase 0 (`PLAN_app_error_boundaries.md`). Phase 1 les **applique partout** pour éliminer les "Chargement..." bruts et les "Aucun résultat" sans contexte.

## 2. Audit de l'existant

### Vues async avec chargement non stylé
- `/annonces` : "Chargement..." + 3 bars grises
- `/messages` : "Chargement..." plain
- `/dossier` : "Chargement..."
- `/mes-candidatures` : "Chargement..."
- `/mon-logement` : "Chargement..."
- `/proprietaire` : spinner ou rien
- `/profil` : rien
- `/favoris` : "Chargement..."
- `/visites` : "Chargement..."

### Empty states à homogénéiser
- `/favoris` vide : text + CTA
- `/mes-candidatures` vide : text + CTA ← déjà propre
- `/annonces` filtré vide : "Aucun logement trouvé" + "Élargir la zone"
- `/messages` vide : "Aucun message"
- `/visites` vide : probable "Aucune visite"
- `/proprietaire/Mes biens` vide : "Aucun bien publié" + CTA ajouter
- `/proprietaire/Candidatures` vide : "Aucune candidature"

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| Tous les fichiers ci-dessus | MODIF | Appliquer `<Skeleton>` / `<EmptyState>`. |
| `nestmatch/app/components/ui/AnnonceSkeleton.tsx` | **NOUVEAU** | Skeleton spécialisé carte annonce. |
| `nestmatch/app/components/ui/MessageSkeleton.tsx` | **NOUVEAU** | Skeleton conv row. |
| `nestmatch/app/components/ui/DocRowSkeleton.tsx` | **NOUVEAU** | Skeleton pour `/dossier`. |

## 4. Migrations SQL
**Aucune**.

## 5. Variables d'env
**Aucune**.

## 6. Dépendances
**Aucune** (primitifs déjà posés en Phase 0).

## 7. Étapes numérotées

### Bloc A — Skeletons spécialisés
1. Créer `app/components/ui/AnnonceSkeleton.tsx` :
    ```tsx
    import Skeleton from "./Skeleton"

    export default function AnnonceSkeleton() {
      return (
        <div style={{ background: "white", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
          <Skeleton height={170} rounded={0} />
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton height={16} width="70%" />
            <Skeleton height={12} width="50%" />
            <Skeleton height={22} width="40%" />
          </div>
        </div>
      )
    }
    ```
2. `MessageSkeleton.tsx` (conv row), `DocRowSkeleton.tsx`, `TimelineSkeleton.tsx`.

### Bloc B — `/annonces`
3. Remplacer le bloc de loading :
    ```tsx
    {loading ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[1, 2, 3].map(i => <div key={i} style={{ background: "white", borderRadius: 16, height: 110, opacity: 0.4 }} />)}
      </div>
    ) : annoncesTraitees.length === 0 ? ...
    ```
    par :
    ```tsx
    {loading ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[1, 2, 3].map(i => <AnnonceSkeleton key={i} />)}
      </div>
    ) : annoncesTraitees.length === 0 ? (
      <EmptyState
        title="Aucun logement trouvé"
        description={mapBounds ? "Essayez d'élargir la zone de recherche." : "Ajustez vos filtres pour voir plus de résultats."}
        ctaLabel={mapBounds ? "Élargir la zone" : undefined}
        onCtaClick={mapBounds ? () => setMapBounds(null) : undefined}
      />
    ) : (...)}
    ```

### Bloc C — `/messages`
4. Remplacer "Chargement..." :
    ```tsx
    {loading ? (
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {[1,2,3,4].map(i => <MessageSkeleton key={i} />)}
      </div>
    ) : convsFiltrees.length === 0 ? (
      <EmptyState
        title={recherche ? "Aucun résultat" : "Aucune conversation"}
        description={!recherche ? (proprietaireActive ? "Les locataires vous contacteront depuis vos annonces." : "Contactez un propriétaire depuis une annonce.") : undefined}
        ctaLabel={!recherche && !proprietaireActive ? "Découvrir les annonces" : undefined}
        ctaHref={!recherche && !proprietaireActive ? "/annonces" : undefined}
      />
    ) : (...)}
    ```

### Bloc D — `/dossier`
5. `DocRowSkeleton` pour les docs en cours de load.
6. Empty state sur `AccessLogPanel` si zéro log.

### Bloc E — `/favoris`
7. EmptyState : "Aucun favori" + CTA "/annonces".

### Bloc F — `/mon-logement`
8. Skeleton complet quand `loading`. Actuellement affiche `Chargement...`.
9. Empty state déjà OK.

### Bloc G — `/proprietaire`
10. Onglet "Mes biens" : skeletons.
11. Onglet "Candidatures" : skeletons.
12. Empty states existent mais à uniformiser via `<EmptyState>`.

### Bloc H — `/visites`
13. Skeleton pendant chargement.
14. EmptyState si aucune visite.

### Bloc I — `/mes-candidatures`
15. Skeleton + empty state déjà partiellement OK.

## 8. Pièges connus

- **Flash of loading** : si données arrivent en < 100 ms, skeleton flash → perçu moche. Délai d'affichage :
    ```tsx
    const [showSkel, setShowSkel] = useState(false)
    useEffect(() => {
      const id = setTimeout(() => setShowSkel(true), 150)
      return () => clearTimeout(id)
    }, [])
    {loading && showSkel && <Skeleton ... />}
    ```
- **Skeleton matching layout** : idéalement, skeleton prend exactement la taille du contenu réel pour pas reflow. Tester sur chaque route.
- **Accessibilité** : `aria-busy="true"` sur container parent. `aria-label="Chargement"` sur skeleton.
- **Thème dark** : les skeletons `#f3f4f6 → #e5e7eb` invisibles en dark. Prévoir couleurs adaptatives :
    ```tsx
    background: "linear-gradient(90deg, var(--skel-a) 0%, var(--skel-b) 50%, var(--skel-a) 100%)"
    ```
    Avec CSS variables `--skel-a`, `--skel-b` définies dans `globals.css` par thème.

## 9. Checklist "c'est fini"

- [ ] 3+ skeletons spécialisés créés (AnnonceSkeleton, MessageSkeleton, DocRowSkeleton).
- [ ] `/annonces`, `/messages`, `/dossier`, `/mon-logement`, `/favoris`, `/mes-candidatures`, `/proprietaire`, `/visites` utilisent Skeleton.
- [ ] Toutes les pages ont un EmptyState custom (pas "Aucun résultat" brut).
- [ ] Délai 150 ms avant d'afficher skeleton (pas de flash si fetch rapide).
- [ ] Dark mode : skeletons visibles.
- [ ] `tsc --noEmit` OK.

---

**Plan OK pour Sonnet.** Pure UI, aucun bloc ⚠️ Opus-only.
