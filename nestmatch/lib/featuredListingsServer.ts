// Server-side fetcher des annonces vedettes pour le RSC `app/page.tsx`.
//
// V71.2 — la home passe en Server Component pour que le markup principal
// (h1, value props, JSON-LD ItemList) soit présent dans le HTML envoyé au
// crawler IA-search (GPTBot, ClaudeBot, PerplexityBot, Googlebot AI Overviews)
// SANS attendre l'hydration JavaScript.
//
// Mêmes filtres que le hook client `useFeaturedListings.ts` :
//   - statut IS NULL OR statut = 'disponible' (whitelist)
//   - is_test = false
//   - photos array non vide (filtré côté JS car Supabase ne sait pas filtrer
//     sur `array_length(photos) > 0` via le SDK simplement)
//   - top N par created_at DESC

import type { FeaturedListing } from "../app/components/home/useFeaturedListings"
import { supabase } from "./supabase"

export async function fetchFeaturedListings(targetCount = 8): Promise<FeaturedListing[]> {
  try {
    const { data } = await supabase
      .from("annonces")
      .select("id, titre, ville, prix, surface, pieces, dpe, photos, statut, created_at")
      .or("statut.is.null,statut.eq.disponible")
      .not("photos", "is", null)
      .eq("is_test", false)
      .order("created_at", { ascending: false })
      .limit(24)

    return (data || [])
      .filter((a: { photos: string[] | null }) =>
        Array.isArray(a.photos) && a.photos.length > 0
      )
      .slice(0, targetCount)
      .map((a: {
        id: number
        titre: string | null
        ville: string | null
        prix: number | null
        surface: number | null
        pieces: number | null
        dpe: string | null
        photos: string[] | null
        statut: string | null
      }) => ({
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
  } catch {
    // Le RSC ne doit jamais throw au runtime. Empty list → HomeClient gère
    // ses propres empty states (Hero photos statiques, CTA inscription, etc.).
    return []
  }
}
