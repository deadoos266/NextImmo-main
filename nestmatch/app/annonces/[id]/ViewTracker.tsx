"use client"
import { useSession } from "next-auth/react"
import { useEffect } from "react"
import { supabase } from "../../../lib/supabase"

/**
 * Tracker de vues fiche annonce. 2 effets :
 *
 * 1. (V63) — Insert dans `clics_annonces` (table dédiée par-user) si l'user
 *    est connecté. Permet de calculer "annonces vues récemment" par un
 *    user particulier sur sa page perso.
 *
 * 2. (V76.2a) — POST fire-and-forget vers /api/annonces/[id]/view qui
 *    incrémente `annonces.nb_vues` (compteur public agrégé). Utilisé par le
 *    tri "Plus populaires" V73.4 / V74.4. Anti-spam côté client : on ne
 *    POST qu'une seule fois par session (sessionStorage), et l'API rate-limite
 *    à 60 vues/min/IP/annonce.
 */
export default function ViewTracker({ annonceId }: { annonceId: number }) {
  const { data: session } = useSession()

  // 1. clics_annonces (track personnel des annonces vues)
  useEffect(() => {
    if (!session?.user?.email) return
    supabase.from("clics_annonces").upsert(
      { annonce_id: annonceId, email: session.user.email },
      { onConflict: "annonce_id,email" }
    ).then(() => {})
  }, [session, annonceId])

  // 2. V76.2a — POST /api/annonces/[id]/view — incrémente nb_vues (compteur
  //    public agrégé utilisé par le tri "Plus populaires" V73.4 / V74.4).
  //    Anti-spam : 1 fois par session (sessionStorage) — un user qui
  //    rafraîchit la page n'incrémente pas en boucle. L'API rate-limite
  //    déjà à 60 vues/min/IP/annonce côté serveur (V74.4).
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const key = `km_view_${annonceId}`
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, "1")
    } catch { /* sessionStorage indispo (private mode iOS, etc.) — POST quand même */ }

    fetch(`/api/annonces/${annonceId}/view`, {
      method: "POST",
      keepalive: true,
    }).catch(() => { /* silent — best-effort */ })
  }, [annonceId])

  return null
}
