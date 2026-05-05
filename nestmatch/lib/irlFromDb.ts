/**
 * V70.7 — Helper IRL avec fallback DB-first puis hardcoded.
 *
 * Pattern : on lit `irl_history` (alimenté par cron INSEE V70.7), si vide
 * ou erreur, on retombe sur `IRL_HISTORIQUE` hardcodé dans `lib/irl.ts`.
 *
 * Usage server-side uniquement (utilise supabaseAdmin).
 *
 * Côté client / pages publiques, continuer à utiliser `lib/irl.ts`
 * directement (pas d'accès DB).
 */

import { supabaseAdmin } from "./supabase-server"
import { IRL_HISTORIQUE, type IrlEntry } from "./irl"

interface IrlHistoryRow {
  trimestre: string
  annee: number
  trim_num: number
  indice: number
  publication_date: string | null
}

let cache: IrlEntry[] | null = null
let cacheExpiresAt = 0
const CACHE_TTL_MS = 60 * 60 * 1000 // 1h

/**
 * Retourne l'historique IRL à jour, lu depuis la DB en priorité.
 * Cache 1h en mémoire pour éviter de hammer la DB sur chaque appel.
 */
export async function fetchIrlHistorique(): Promise<IrlEntry[]> {
  if (cache && Date.now() < cacheExpiresAt) return cache

  try {
    const { data, error } = await supabaseAdmin
      .from("irl_history")
      .select("trimestre, annee, trim_num, indice, publication_date")
      .order("annee", { ascending: false })
      .order("trim_num", { ascending: false })
      .limit(40)

    if (error || !data || data.length === 0) {
      cache = [...IRL_HISTORIQUE]
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbRows: IrlEntry[] = (data as IrlHistoryRow[]).map(r => ({
        trimestre: r.trimestre,
        annee: r.annee,
        trimNum: (r.trim_num as 1 | 2 | 3 | 4),
        indice: Number(r.indice),
        publicationDate: r.publication_date || "",
        variation: "", // pas stocké en DB pour le moment
      }))
      // Merge avec hardcoded au cas où la DB n'a que les récents : on garde
      // les hardcoded pour les trimestres anciens non-couverts.
      const seen = new Set(dbRows.map(r => r.trimestre))
      for (const h of IRL_HISTORIQUE) {
        if (!seen.has(h.trimestre)) dbRows.push(h)
      }
      cache = dbRows
    }
  } catch {
    cache = [...IRL_HISTORIQUE]
  }

  cacheExpiresAt = Date.now() + CACHE_TTL_MS
  return cache
}

/**
 * Retourne le dernier IRL connu (= row la plus récente).
 */
export async function irlDernierFromDb(): Promise<IrlEntry> {
  const histo = await fetchIrlHistorique()
  return histo[0]
}

/**
 * Retourne l'IRL d'un trimestre donné, ou null si inconnu.
 */
export async function irlDuTrimestreFromDb(
  input: string | { annee: number; trimNum: number },
): Promise<IrlEntry | null> {
  const histo = await fetchIrlHistorique()
  if (typeof input === "string") {
    return histo.find(e => e.trimestre === input) || null
  }
  return histo.find(e => e.annee === input.annee && e.trimNum === input.trimNum) || null
}

/** Reset cache (utile pour tests ou après un scrape réussi). */
export function resetIrlCache(): void {
  cache = null
  cacheExpiresAt = 0
}
