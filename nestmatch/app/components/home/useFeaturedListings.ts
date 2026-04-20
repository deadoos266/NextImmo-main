"use client"
import { useEffect, useState } from "react"
import { supabase } from "../../../lib/supabase"
import { CARD_GRADIENTS } from "../../../lib/cardGradients"

/**
 * Hook qui fetch les 8 dernières annonces disponibles avec au moins une photo.
 * Si moins de 8 résultats, complète avec des placeholders "gradient fallback"
 * pour que toutes les sections de la Home restent complètes visuellement.
 *
 * Aucun impact sur les filtres de /annonces : c'est une lecture read-only.
 */

export type FeaturedListing = {
  id: number
  titre: string | null
  ville: string | null
  quartier?: string | null
  prix: number | null
  surface: number | null
  pieces: number | null
  dpe: string | null
  photos: string[]
  _placeholder?: boolean // true si fallback gradient (pas une vraie annonce)
  _gradient?: string     // gradient fallback CSS
  _matchPct?: number     // score mocké pour affichage (72-92 %)
}

export function useFeaturedListings(targetCount = 8) {
  const [listings, setListings] = useState<FeaturedListing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data } = await supabase
          .from("annonces")
          .select("id, titre, ville, adresse, prix, surface, pieces, dpe, photos, statut, created_at")
          .or("statut.is.null,statut.neq.loué")
          .order("created_at", { ascending: false })
          .limit(24) // on prend plus large pour filtrer ensuite sur photos

        if (!alive) return

        const withPhotos: FeaturedListing[] = (data || [])
          .filter((a: any) => Array.isArray(a.photos) && a.photos.length > 0)
          .slice(0, targetCount)
          .map((a: any, i: number) => ({
            id: a.id,
            titre: a.titre,
            ville: a.ville,
            quartier: null, // pas stocké en DB, le design l'affiche si dispo
            prix: a.prix,
            surface: a.surface,
            pieces: a.pieces,
            dpe: a.dpe,
            photos: a.photos,
            // Mock score matching : dégressif, stable par id pour éviter
            // le flash de réhydratation. Les vrais scores restent côté /annonces.
            _matchPct: 92 - (i * 3) - (a.id % 5),
          }))

        // Complète jusqu'à `targetCount` avec des placeholders gradient
        const missing = targetCount - withPhotos.length
        const placeholders: FeaturedListing[] = Array.from({ length: Math.max(0, missing) }).map((_, i) => {
          const idx = withPhotos.length + i
          return {
            id: -1000 - idx, // id négatif pour éviter toute collision
            titre: "Logement à découvrir",
            ville: null,
            prix: null,
            surface: null,
            pieces: null,
            dpe: null,
            photos: [],
            _placeholder: true,
            _gradient: CARD_GRADIENTS[idx % CARD_GRADIENTS.length],
            _matchPct: 70 - i * 2,
          }
        })

        setListings([...withPhotos, ...placeholders])
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [targetCount])

  return { listings, loading }
}
