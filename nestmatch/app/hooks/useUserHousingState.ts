"use client"
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { supabase } from "../../lib/supabase"

/**
 * État dérivé du parcours locataire pour le gating UI.
 *
 *  - hasCurrentHousing : 1+ annonce avec `locataire_email = me`. Source de
 *    vérité : c'est ce que /mon-logement et /carnet utilisent déjà pour
 *    décider quoi afficher. Si > 0, l'utilisateur a un bail actif en cours.
 *  - hasPastHousing : `profils.anciens_logements` (jsonb array) non vide.
 *    Cette colonne est peuplée par /api/annonces/terminer-bail au moment
 *    où le proprio bascule la fin de bail (cf /anciens-logements/page.tsx).
 *
 * Utilisé par Navbar + Footer pour masquer "Mon logement / Carnet /
 * Quittances / Anciens logements" tant que l'état correspondant n'existe
 * pas. Les routes restent accessibles en URL directe — chaque page rend
 * son propre EmptyState éditorial dans ce cas.
 */
type HousingState = {
  hasCurrentHousing: boolean
  hasPastHousing: boolean
  loading: boolean
}

const INITIAL: HousingState = { hasCurrentHousing: false, hasPastHousing: false, loading: true }

export function useUserHousingState(): HousingState {
  const { data: session, status } = useSession()
  const [state, setState] = useState<HousingState>(INITIAL)

  useEffect(() => {
    if (status === "loading") return
    if (status === "unauthenticated" || !session?.user?.email) {
      setState({ hasCurrentHousing: false, hasPastHousing: false, loading: false })
      return
    }
    const email = session.user.email.toLowerCase()
    let cancelled = false

    Promise.all([
      // Bail actif courant — count exact via head:true (pas de payload).
      // IMPORTANT : `/api/annonces/terminer-bail` ne reset PAS
      // `annonces.locataire_email` (il sauvegarde dans `locataire_email_at_end`
      // et bascule `statut = "loue_termine"`). Donc on filtre explicitement les
      // annonces terminées, sinon un user qui a juste un ancien bail aurait
      // `hasCurrentHousing = true` à tort.
      supabase.from("annonces")
        .select("id", { count: "exact", head: true })
        .ilike("locataire_email", email)
        .neq("statut", "loue_termine"),
      // V42.1 — Anciens logements stockés en jsonb sur profils.
      // Avant : supabase.from("profils").select("anciens_logements") côté
      // client → 401 depuis migration 036 (REVOKE SELECT anon).
      // Maintenant : passe par /api/profil/me?cols=anciens_logements
      // (NextAuth-gated + supabaseAdmin server-side).
      fetch("/api/profil/me?cols=anciens_logements", { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(j => ({ data: j?.ok ? j.profil : null }))
        .catch(() => ({ data: null })),
    ]).then(([curRes, profilRes]) => {
      if (cancelled) return
      const hasCurrent = (curRes.count ?? 0) > 0
      const ancien = (profilRes.data as { anciens_logements?: unknown } | null)?.anciens_logements
      const hasPast = Array.isArray(ancien) && ancien.length > 0
      setState({ hasCurrentHousing: hasCurrent, hasPastHousing: hasPast, loading: false })
    }).catch(() => {
      if (cancelled) return
      // En cas d'erreur réseau on dégrade silencieusement : pas de gating
      // (on ne masque rien plutôt que d'induire une perception de feature
      // disparue). L'utilisateur cliquera, atterrira sur l'EmptyState.
      setState({ hasCurrentHousing: false, hasPastHousing: false, loading: false })
    })

    return () => { cancelled = true }
  }, [session, status])

  return state
}
