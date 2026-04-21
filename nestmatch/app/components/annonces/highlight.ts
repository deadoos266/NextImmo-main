import type { ReactNode } from "react"
import { createElement, Fragment } from "react"

/**
 * Highlight d'un terme dans un texte. Retourne un fragment React avec
 * les matchs entourés de <mark>. Case-insensitive, accents-insensitive
 * (normalisation NFD sur les 2 côtés pour matcher « ecole » vs « école »).
 *
 * Extrait depuis app/annonces/AnnoncesClient.tsx pour être réutilisable
 * par ListingCardSearch (grid + horizontal) et d'autres consommateurs.
 */
export function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim()
  if (!q || !text) return text
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const haystack = norm(text)
  const needle = norm(q)
  if (needle.length === 0 || !haystack.includes(needle)) return text

  const parts: ReactNode[] = []
  let cursor = 0
  let idx = haystack.indexOf(needle, cursor)
  let keyN = 0
  while (idx !== -1) {
    if (idx > cursor) parts.push(text.slice(cursor, idx))
    parts.push(
      createElement(
        "mark",
        {
          key: keyN++,
          style: { background: "#fef08a", color: "#111", padding: "0 2px", borderRadius: 3 },
        },
        text.slice(idx, idx + needle.length)
      )
    )
    cursor = idx + needle.length
    idx = haystack.indexOf(needle, cursor)
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return createElement(Fragment, null, ...parts)
}
