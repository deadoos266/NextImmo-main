"use client"
import { useEffect, useState } from "react"
import { supabase } from "../../../lib/supabase"

/**
 * Hook qui fetch les 8 annonces les plus récentes et disponibles à la
 * location. Retourne [] si la DB n'a rien, les consommateurs gèrent leur
 * propre empty state (LiveFeed CTA, Hero fallback /public/hero, etc.).
 *
 * Whitelist: 'disponible' (création) + null (legacy). Exclut 'loué' et
 * 'bail_envoye' (un bien en signature ne doit plus apparaître en vitrine).
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
  statut: string | null
  photos: string[]
}

export function useFeaturedListings(targetCount = 8) {
  const [listings, setListings] = useState<FeaturedListing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // Whitelist Supabase : statut IS NULL OR statut = 'disponible'.
        // `.not('photos', 'is', null)` exclut les annonces avec colonne
        // photos NULL (mais pas les arrays vides — on filtre ensuite côté JS).
        // On prend 24 pour avoir de la marge et filtrer après.
        const { data } = await supabase
          .from("annonces")
          .select("id, titre, ville, prix, surface, pieces, dpe, photos, statut, created_at")
          .or("statut.is.null,statut.eq.disponible")
          .not("photos", "is", null)
          .order("created_at", { ascending: false })
          .limit(24)

        if (!alive) return

        // Filtre final côté JS : photos array non vide + limit targetCount.
        const rows: FeaturedListing[] = (data || [])
          .filter((a: { photos: string[] | null }) =>
            Array.isArray(a.photos) && a.photos.length > 0
          )
          .slice(0, targetCount)
          .map((a: { id: number; titre: string | null; ville: string | null; prix: number | null; surface: number | null; pieces: number | null; dpe: string | null; photos: string[] | null; statut: string | null }) => ({
            id: a.id,
            titre: a.titre,
            ville: a.ville,
            quartier: null,
            prix: a.prix,
            surface: a.surface,
            pieces: a.pieces,
            dpe: a.dpe,
            statut: a.statut,
            photos: Array.isArray(a.photos) ? a.photos : [],
          }))

        setListings(rows)
      } finally {
        if (alive) setLoading(false)
      }
    })()
  }, [targetCount])

  return { listings, loading }
}
