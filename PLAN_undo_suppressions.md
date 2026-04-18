# PLAN — Undo sur suppressions critiques

## 1. Contexte et objectif
Plusieurs actions destructives n'ont pas d'undo : supprimer annonce (/proprietaire), supprimer conv (/messages), supprimer doc dossier (/dossier), archiver conv (existe mais pas d'undo), retirer candidature (/mes-candidatures). Un clic raté = perte définitive. Poser un pattern "soft delete + undo 5 sec" pour les actions les plus fréquentes.

## 2. Audit de l'existant

### Confirm inline déjà en place
- `/mes-candidatures` : bouton Retirer → "Confirmer / Annuler" ✓
- `/proprietaire` suppression bien : confirm inline ✓
- `/dossier` DocRow delete : confirm inline ✓

Mais **après confirmation, hard delete**. Pas d'undo.

### Actions concernées (priorisées)
| Action | Où | Destructif ? | Undo utile ? |
|---|---|---|---|
| Supprimer annonce | `/proprietaire` | Oui, cascade | 🔥 Critique |
| Supprimer message | `/messages` menu ⋯ | Oui (hard delete DB) | 🔥 Critique |
| Archiver conv | `/messages` menu ⋯ | Non (localStorage, easy undo déjà) | Moyen (toggle) |
| Supprimer doc dossier | `/dossier` DocRow | Oui (storage + DB) | 🔥 Critique |
| Retirer candidature | `/mes-candidatures` | Non destructif (juste préfixe msg) | Faible |
| Supprimer compte | `/parametres/compte` | Cascade totale | 🔥 Critique (déjà confirm fort) |

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/app/components/ui/UndoToast.tsx` | **NOUVEAU** | Toast avec "Annuler" bouton visible 5 sec, callback si clic. |
| `nestmatch/app/components/ui/useUndo.tsx` | **NOUVEAU** | Hook `useUndo(onConfirm, onUndo, delayMs)`. |
| `nestmatch/app/proprietaire/page.tsx` | MODIF | `supprimerBien` : pose undo toast, delete réel après 5 sec. |
| `nestmatch/app/messages/page.tsx` | MODIF | `supprimerConversation` + `supprimerMessage` : pose undo. |
| `nestmatch/app/dossier/page.tsx` | MODIF | `removeDoc` : pose undo. |

## 4. Migrations SQL

**Optionnel** — si on veut vraie corbeille server-side (plus robuste que attendre 5 sec client) :

```sql
-- <timestamp>_corbeille_actions.sql
-- À considérer Phase 2 si volume d'undo important.
-- Pour Phase 1, on reste client-side seulement.
```

**Pour Phase 1, aucune migration.** Le pattern est : client attend 5 sec avant de vraiment appeler l'API DELETE. Si undo clic → annule le timer, pas de delete.

## 5. Variables d'env
**Aucune**.

## 6. Dépendances
**Aucune**.

## 7. Étapes numérotées

### Bloc A — Hook `useUndo`
1. Créer `app/components/ui/useUndo.tsx` :
    ```tsx
    "use client"
    import { useCallback, useRef, useState } from "react"

    /**
     * Pattern "optimistic delete + undo 5 sec".
     *
     * Appel `trigger(item)` :
     *   1. Item disparu de l'UI (optimistic)
     *   2. Timer 5 sec
     *   3. Si user clic undo → item revient, onCancel()
     *   4. Si timer expire → onConfirm() appelle l'API DELETE réelle
     *
     * Retourne { pending, trigger, undo } pour monter un UndoToast.
     */
    type UseUndoOpts<T> = {
      delayMs?: number
      onConfirm: (item: T) => Promise<void> | void
    }

    export function useUndo<T>({ delayMs = 5000, onConfirm }: UseUndoOpts<T>) {
      const [pending, setPending] = useState<T | null>(null)
      const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

      const trigger = useCallback((item: T) => {
        if (timerRef.current) clearTimeout(timerRef.current)
        setPending(item)
        timerRef.current = setTimeout(() => {
          // Commit : appelle l'API réelle
          Promise.resolve(onConfirm(item)).finally(() => {
            setPending(null)
            timerRef.current = null
          })
        }, delayMs)
      }, [delayMs, onConfirm])

      const undo = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current)
        setPending(null)
        timerRef.current = null
      }, [])

      return { pending, trigger, undo }
    }
    ```

### Bloc B — Composant `UndoToast`
2. Créer `app/components/ui/UndoToast.tsx` :
    ```tsx
    "use client"
    import { useEffect, useState } from "react"
    import { createPortal } from "react-dom"

    type Props = {
      message: string
      onUndo: () => void
      delayMs?: number       // default 5000
    }

    export default function UndoToast({ message, onUndo, delayMs = 5000 }: Props) {
      const [mounted, setMounted] = useState(false)
      const [remaining, setRemaining] = useState(delayMs)

      useEffect(() => { setMounted(true) }, [])

      // Countdown visuel
      useEffect(() => {
        const start = Date.now()
        const id = setInterval(() => {
          const elapsed = Date.now() - start
          const left = Math.max(0, delayMs - elapsed)
          setRemaining(left)
          if (left === 0) clearInterval(id)
        }, 100)
        return () => clearInterval(id)
      }, [delayMs])

      if (!mounted) return null

      const pct = (remaining / delayMs) * 100

      return createPortal(
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#111", color: "white", padding: "12px 16px 10px", borderRadius: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", minWidth: 280, display: "flex", alignItems: "center", gap: 16, fontFamily: "'DM Sans', sans-serif" }}>
          <span style={{ fontSize: 13, flex: 1 }}>{message}</span>
          <button type="button" onClick={onUndo}
            style={{ background: "white", color: "#111", border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          {/* Barre de progression */}
          <div style={{ position: "absolute", bottom: 0, left: 0, height: 2, background: "rgba(255,255,255,0.5)", width: `${pct}%`, transition: "width 100ms linear" }} />
        </div>,
        document.body
      )
    }
    ```

### Bloc C — Intégration `/proprietaire` supprimerBien
3. Dans `app/proprietaire/page.tsx`, trouver `supprimerBien(id)`. Refactor :
    ```tsx
    import { useUndo } from "../components/ui/useUndo"
    import UndoToast from "../components/ui/UndoToast"

    const { pending, trigger: triggerSuppression, undo } = useUndo<number>({
      onConfirm: async (id) => {
        const res = await fetch(`/api/annonces/${id}`, { method: "DELETE" })
        if (res.ok) setBiens(prev => prev.filter(b => b.id !== id))
        else alert("Suppression échouée")
      },
    })

    function supprimerBien(id: number) {
      // Retire immédiatement de la UI (optimistic)
      setBiens(prev => prev.filter(b => b.id !== id))
      setSupprimerId(null)
      triggerSuppression(id)
    }
    ```
4. Monter `<UndoToast>` conditionnel dans le JSX :
    ```tsx
    {pending !== null && (
      <UndoToast
        message="Annonce supprimée"
        onUndo={() => {
          undo()
          // Rebasculer le bien dans la liste
          // Alternative simple : refetch complet les biens depuis Supabase
          loadBiens()
        }}
      />
    )}
    ```
5. Pour que undo marche, il faut garder une **copie du bien supprimé** avant retrait optimistic. Option plus propre :
    ```tsx
    const [trash, setTrash] = useState<Bien | null>(null)
    function supprimerBien(id: number) {
      const bien = biens.find(b => b.id === id)
      if (!bien) return
      setTrash(bien)
      setBiens(prev => prev.filter(b => b.id !== id))
      triggerSuppression(id)
    }
    // onUndo :
    onUndo={() => { undo(); if (trash) setBiens(prev => [trash, ...prev]); setTrash(null) }}
    ```

### Bloc D — Intégration `/messages` supprimerConversation
6. Pattern identique. Le `supprimerConversation(key)` fait `supabase.from("messages").delete().or(...)` — **dangereux** car bulk delete. Undo nécessite soit :
    - Client-side snapshot de tous les messages + restore (lourd)
    - Ou : soft delete via colonne `messages.deleted_at` (mieux, mais migration nécessaire — à garder pour Phase 2)
7. **Pragmatique Phase 1** : garder le confirm inline strict pour suppression conv, **ne pas** mettre undo. Trop risqué sans soft delete server-side.

### Bloc E — Intégration `/dossier` removeDoc
8. `removeDoc(key, idx)` supprime l'URL du JSONB `dossier_docs`. Undo simple car l'URL Supabase Storage reste stockée (pas de delete storage avant 5 sec).
9. Pattern :
    ```tsx
    const [trashDoc, setTrashDoc] = useState<{ key: DocKey; idx: number; url: string } | null>(null)
    const { trigger: triggerRemoveDoc, undo: undoRemoveDoc } = useUndo<{ key: DocKey; url: string }>({
      onConfirm: async ({ key, url }) => {
        // Delete le fichier storage maintenant que l'undo est passé
        const path = url.split("/storage/v1/object/public/dossiers/")[1]
        if (path) await supabase.storage.from("dossiers").remove([path.split("?")[0]])
      },
    })

    async function removeDoc(key: DocKey, idx: number) {
      if (!session?.user?.email) return
      const url = (docs[key] || [])[idx]
      if (!url) return
      setTrashDoc({ key, idx, url })
      const updated = { ...docs, [key]: (docs[key] || []).filter((_, i) => i !== idx) }
      if (updated[key].length === 0) delete updated[key]
      setDocs(updated)
      await supabase.from("profils").upsert({ email: session.user.email.toLowerCase(), dossier_docs: updated }, { onConflict: "email" })
      triggerRemoveDoc({ key, url })
    }

    // Undo : re-inject dans docs + re-upsert, annule delete storage
    ```

### Bloc F — Tests
10. Tests manuels :
    - Supprimer annonce → attendre 5 sec sans clic → GET annonce = 404.
    - Supprimer annonce → clic Annuler dans 3 sec → GET annonce = 200, toujours en liste.
    - Supprimer doc dossier → undo 3 sec → fichier toujours affiché, URL toujours valide.
    - Supprimer doc → wait 6 sec → URL 404 dans storage.

## 8. Pièges connus

- **Navigate pendant pending** : si user quitte la page avant timer, le timer n'exécute pas `onConfirm` → **item pas vraiment delete**. Soft mais acceptable (à la prochaine visite, il est toujours là). Alternative : `window.addEventListener("beforeunload", onConfirm)` mais fragile.
- **Multi-delete rapide** : si user delete 3 annonces en 2 sec, 3 undo toasts se superposent. Solution : queue, ou réutiliser le slot courant (override). Version pragmatique : 1 seul toast à la fois, replace.
- **React dev double-render** : hook avec `useRef` + `useEffect` → attention strict mode qui mount deux fois. Tester en prod build.
- **Storage cost** : ne pas delete immédiatement économise UX mais laisse les fichiers 5 sec de plus. Négligeable.
- **Cascade annonce** : `DELETE /api/annonces/[id]` cascade visites, messages, carnet, loyers, EDL. Un undo doit **tout** restaurer. **Impossible sans server-side soft delete**. → Phase 1 : undo côté UI seulement, si timer expire et delete cascade → pas revenable. Afficher un disclaimer sur la confirmation initiale : "Supprimer cette annonce ? Toutes les données liées (visites, messages, EDL) seront définitivement perdues après 5 sec."
- **Accessibilité** : toast doit avoir `role="status"` + bouton undo focusable.

## 9. Checklist "c'est fini"

- [ ] `useUndo` hook créé.
- [ ] `UndoToast` composant créé, monte via portal.
- [ ] Suppression annonce : undo visible, annulable 5 sec.
- [ ] Suppression doc dossier : undo visible.
- [ ] Tests manuels OK sur 2 scénarios.
- [ ] Pas de régression sur suppressions existantes.
- [ ] `tsc --noEmit` OK.

---

**Plan OK pour Sonnet.** Aucun bloc ⚠️ Opus-only : pure pattern UX client-side.

⚠️ **Skip intentionnel** pour `/messages` supprimerConversation (cascade DB sans soft delete = dangereux). Attendre Phase 2 pour soft delete messages.
