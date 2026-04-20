"use client"
import { useEffect, useState } from "react"
import { supabase } from "../../../lib/supabase"

/**
 * Hook qui fetch les 8 annonces les plus récentes de la DB, **sans inventer
 * de placeholders**. Si la DB a 3 annonces, on retourne 3. Si elle en a 0,
 * on retourne [] et les consommateurs gèrent leur propre empty state
 * (LiveFeed → empty state CTA, Hero → fallback /public/hero/*.jpg, etc.).
 *
 * Paul : "que la sélection du moment soit vraiment indexée sur les
 * annonces actuelles" + "genre ça prend 8 annonces au hasard du site".
 * On filtre PAS par statut pour que même les biens déjà loués puissent
 * servir de vitrine (en attendant de nouvelles publications).
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
        const { data } = await supabase
          .from("annonces")
          .select("id, titre, ville, prix, surface, pieces, dpe, photos, statut, created_at")
          .order("created_at", { ascending: false })
          .limit(targetCount)

        if (!alive) return

        const rows: FeaturedListing[] = (data || []).map((a: { id: number; titre: string | null; ville: string | null; prix: number | null; surface: number | null; pieces: number | null; dpe: string | null; photos: string[] | null; statut: string | null }) => ({
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
