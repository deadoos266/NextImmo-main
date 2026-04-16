const KEY = "nestmatch_favoris"

export function getFavoris(): number[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]")
  } catch {
    return []
  }
}

export function isFavori(id: number): boolean {
  return getFavoris().includes(id)
}

export function toggleFavori(id: number): boolean {
  const current = getFavoris()
  const exists = current.includes(id)
  const next = exists ? current.filter(x => x !== id) : [...current, id]
  localStorage.setItem(KEY, JSON.stringify(next))
  return !exists
}
