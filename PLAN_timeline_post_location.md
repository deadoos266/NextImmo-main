# PLAN — Timeline post-location (4 étapes visible proprio + locataire)

## 1. Contexte et objectif
Après « Louer à ce candidat », les 2 parties sont dans un flou. Timeline visuelle à 4 étapes :
1. ✓ Location acceptée
2. ○ Bail généré + signé
3. ○ EDL d'entrée validé
4. ○ Premier loyer encaissé

Visible dans `/mon-logement` (locataire) et `/proprietaire` (onglet Mes locataires) pour la même annonce. Même état source pour les 2 parties.

## 2. Audit de l'existant

Colonnes déjà présentes dans `annonces` :
- `statut = "loué"` → étape 1 OK
- `bail_genere_at` → étape 2 partiellement (signature manque)
- `date_debut_bail` → date début bail

Dans `etats_des_lieux` :
- `statut = "valide"` → étape 3

Dans `loyers` :
- `statut = "confirmé"` sur au moins 1 row → étape 4

Tout est déjà **en base**, il manque juste la visualisation.

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/lib/bailTimeline.ts` | **NOUVEAU** | Calcul des 4 étapes depuis les données DB. |
| `nestmatch/app/components/ui/BailTimeline.tsx` | **NOUVEAU** | Composant visuel stepper. |
| `nestmatch/app/mon-logement/page.tsx` | MODIF | Monter `<BailTimeline>` en haut, après header. |
| `nestmatch/app/proprietaire/page.tsx` | MODIF | Dans onglet "Mes locataires", ajouter `<BailTimeline>` par card bien loué. |

## 4. Migrations SQL
**Aucune** (colonnes existent déjà via 006).

Optionnel : ajouter `bail_signe_at` pour distinguer `genere` vs `signe` (utile Phase 2 signature électronique) :
```sql
ALTER TABLE annonces ADD COLUMN IF NOT EXISTS bail_signe_at timestamptz;
NOTIFY pgrst, 'reload schema';
```

## 5. Variables d'env
**Aucune**.

## 6. Dépendances
**Aucune**.

## 7. Étapes numérotées

### Bloc A — Lib de calcul
1. Créer `lib/bailTimeline.ts` :
    ```ts
    export type BailStep = {
      key: "acceptee" | "bail" | "edl" | "loyer"
      label: string
      description: string
      done: boolean
      date?: string        // ISO si dispo
      href?: string        // CTA vers page qui permet d'avancer
    }

    type Inputs = {
      annonce: {
        statut?: string | null
        bail_genere_at?: string | null
        date_debut_bail?: string | null
        id: number | string
      }
      edls: { statut?: string | null; type?: string | null; date_edl?: string | null }[]
      loyers: { statut?: string | null; mois?: string | null }[]
      role: "proprietaire" | "locataire"
    }

    export function computeBailTimeline({ annonce, edls, loyers, role }: Inputs): BailStep[] {
      const accepteeDone = annonce.statut === "loué"
      const bailDone = !!annonce.bail_genere_at
      const edlEntreeValide = edls.some(e => e.type === "entree" && e.statut === "valide")
      const premierLoyerPaye = loyers.some(l => l.statut === "confirmé")

      return [
        {
          key: "acceptee",
          label: "Location acceptée",
          description: accepteeDone ? "Le propriétaire vous a accepté." : "En attente",
          done: accepteeDone,
          date: annonce.date_debut_bail ?? undefined,
        },
        {
          key: "bail",
          label: "Bail signé",
          description: bailDone
            ? "Le contrat de bail est généré."
            : role === "proprietaire"
              ? "Générez le contrat depuis vos documents."
              : "Votre propriétaire va générer le contrat.",
          done: bailDone,
          date: annonce.bail_genere_at ?? undefined,
          href: role === "proprietaire" ? `/proprietaire/bail/${annonce.id}` : undefined,
        },
        {
          key: "edl",
          label: "État des lieux d'entrée",
          description: edlEntreeValide
            ? "EDL validé contradictoirement."
            : role === "proprietaire"
              ? "À réaliser lors de la remise des clés."
              : "Lors de la remise des clés avec le propriétaire.",
          done: edlEntreeValide,
          href: role === "proprietaire" ? `/proprietaire/edl/${annonce.id}` : undefined,
        },
        {
          key: "loyer",
          label: "Premier loyer encaissé",
          description: premierLoyerPaye
            ? "Paiement confirmé, quittance disponible."
            : role === "proprietaire"
              ? "Confirmez dès réception."
              : "Vous recevrez une quittance automatiquement.",
          done: premierLoyerPaye,
          href: role === "proprietaire" ? `/proprietaire/stats?id=${annonce.id}` : "/mon-logement",
        },
      ]
    }
    ```

### Bloc B — Composant UI
2. Créer `app/components/ui/BailTimeline.tsx` :
    ```tsx
    "use client"
    import Link from "next/link"
    import type { BailStep } from "../../../lib/bailTimeline"

    export default function BailTimeline({ steps }: { steps: BailStep[] }) {
      const doneCount = steps.filter(s => s.done).length
      return (
        <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Votre location pas à pas</h2>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>{doneCount}/{steps.length} étapes</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0, position: "relative" }}>
            {steps.map((s, i) => (
              <div key={s.key} style={{ display: "flex", gap: 14, position: "relative" }}>
                {/* Cercle + ligne verticale */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: s.done ? "#16a34a" : "white", border: `2px solid ${s.done ? "#16a34a" : "#e5e7eb"}`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                    {s.done ? "✓" : <span style={{ color: "#9ca3af" }}>{i + 1}</span>}
                  </div>
                  {i < steps.length - 1 && (
                    <div style={{ width: 2, flex: 1, background: s.done ? "#16a34a" : "#e5e7eb", minHeight: 32 }} />
                  )}
                </div>
                {/* Contenu étape */}
                <div style={{ flex: 1, paddingBottom: i < steps.length - 1 ? 24 : 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: s.done ? "#111" : "#6b7280", margin: 0 }}>{s.label}</p>
                    {s.date && (
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>
                        {new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0", lineHeight: 1.5 }}>{s.description}</p>
                  {!s.done && s.href && (
                    <Link href={s.href} style={{ display: "inline-block", marginTop: 8, background: "#111", color: "white", padding: "7px 14px", borderRadius: 999, textDecoration: "none", fontSize: 12, fontWeight: 700 }}>
                      {s.key === "bail" ? "Générer le bail →" : s.key === "edl" ? "Faire l'EDL →" : s.key === "loyer" ? "Gérer →" : "Continuer →"}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }
    ```

### Bloc C — Intégration `/mon-logement`
3. Ouvrir `app/mon-logement/page.tsx`. Après le fetch bien + edls + loyers, calculer :
    ```ts
    import { computeBailTimeline } from "../../lib/bailTimeline"
    import BailTimeline from "../components/ui/BailTimeline"

    const steps = computeBailTimeline({
      annonce: bien,
      edls: edls,
      loyers: loyers,
      role: "locataire",
    })
    ```
4. Monter `<BailTimeline steps={steps} />` juste après le header, avant les sections existantes.

### Bloc D — Intégration `/proprietaire` onglet Mes locataires
5. Dans la boucle des biens actifs (card), après le bloc infos, ajouter un expandable "Progression" ou directement la timeline compacte.
6. Fetch (déjà partiel) : loyers filtrés `annonce_id`, edls filtré idem. Si pas déjà là, ajouter dans le useEffect principal.

### Bloc E — Réactivité
7. La timeline se met à jour au changement de `bien.statut`, `bien.bail_genere_at`, `edls`, `loyers`. React natif (re-render sur state change). Pas de magie.

## 8. Pièges connus

- **Locataire vs proprio** : `href` des étapes change. Le locataire **ne peut pas** générer le bail ni faire l'EDL — juste attendre. Bien gérer la prop `role`.
- **Dates optionnelles** : certaines étapes n'ont pas de date (ex : "EDL validé" — on peut prendre `created_at` du row). À harmoniser.
- **Étape 4 "loyer"** : `loyers.some(l => l.statut === "confirmé")` déclenche dès le 1er loyer. Si c'est le bon critère.
- **`edls.type === "entree"`** : vérifier la valeur exacte en DB (peut être "entrée" avec accent). Harmoniser.
- **Responsivité** : steps en colonne pas de pb, mais Link buttons doivent wrap.
- **Accessibilité** : `aria-label` sur les `<Link>` (ex : `"Étape 2 : générer le bail"`).
- **Dark mode** : vérifier contrastes, couleurs `#16a34a` (vert) / `#e5e7eb` (gris).

## 9. Checklist "c'est fini"

- [ ] `lib/bailTimeline.ts` avec tests unitaires (2-3 cas : état initial, mi-parcours, tout terminé).
- [ ] `BailTimeline` composant affichable.
- [ ] `/mon-logement` (locataire) montre la timeline en haut.
- [ ] `/proprietaire` (Mes locataires) montre la timeline par bien loué.
- [ ] Clic sur CTA étape "Bail" (proprio) → `/proprietaire/bail/[id]`.
- [ ] Une fois toutes les étapes faites, toutes les cases cochées vertes.
- [ ] `tsc --noEmit` OK.

---

**Plan OK pour Sonnet.** Aucun bloc ⚠️ Opus-only : pure visualisation + lib de calcul déterministe.
