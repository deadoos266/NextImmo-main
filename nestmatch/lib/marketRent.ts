import { supabase } from "./supabase"

interface Params {
  ville: string
  surface?: number | null
  pieces?: number | string | null
}

interface Result {
  median: number | null
  count: number
  min: number | null
  max: number | null
}

/**
 * Estime le loyer de marché pour un bien donné (ville + surface + pièces).
 * Calcule la médiane des biens similaires publiés sur la plateforme.
 * Tolérance surface : ± 25 %.
 */
export async function estimerLoyerMarche({ ville, surface, pieces }: Params): Promise<Result> {
  if (!ville) return { median: null, count: 0, min: null, max: null }

  let query = supabase
    .from("annonces")
    .select("prix,surface,pieces")
    .ilike("ville", `%${ville.trim()}%`)
    .not("prix", "is", null)
    .gt("prix", 0)

  if (pieces && String(pieces).trim() !== "") {
    query = query.eq("pieces", String(pieces))
  }

  const { data } = await query
  if (!data || data.length === 0) return { median: null, count: 0, min: null, max: null }

  // Filtre surface ± 25 %
  const surfaceNum = typeof surface === "number" ? surface : Number(surface)
  const filtered = surfaceNum && !isNaN(surfaceNum) && surfaceNum > 0
    ? data.filter(a => {
        const s = Number(a.surface)
        return !isNaN(s) && s > 0 && s >= surfaceNum * 0.75 && s <= surfaceNum * 1.25
      })
    : data

  const prices = filtered.map(a => Number(a.prix)).filter(p => !isNaN(p) && p > 0).sort((a, b) => a - b)
  if (prices.length === 0) return { median: null, count: 0, min: null, max: null }

  const mid = Math.floor(prices.length / 2)
  const median = prices.length % 2 === 0 ? Math.round((prices[mid - 1] + prices[mid]) / 2) : prices[mid]

  return {
    median,
    count: prices.length,
    min: prices[0],
    max: prices[prices.length - 1],
  }
}
