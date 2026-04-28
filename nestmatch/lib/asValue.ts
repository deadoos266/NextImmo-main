// V6.2 (Paul 2026-04-28) — coercion helpers pour les colonnes annonces typees
// salement en prod (TEXT au lieu de int/bool/numeric). Audit Supabase prod
// montre que prix, charges, surface, pieces, chambres, meuble, parking, cave,
// fibre, animaux_politique etc oscillent entre "true"/"false"/"oui"/"non"/
// boolean nu/null/string-num. Helpers unifies pour normaliser au point d'entree
// (lecture supabase).

/**
 * Parse un nombre depuis n'importe quoi : number, "123", "123.45", "1 234",
 * "1,234.5". null/undefined/string vide/non-num → fallback (default undefined).
 */
export function asNumber(v: unknown, fallback?: number): number | undefined {
  if (v == null) return fallback
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback
  if (typeof v === "boolean") return fallback  // bool n'est pas un number
  if (typeof v === "string") {
    const trimmed = v.trim()
    if (!trimmed) return fallback
    // Accepte "1 234", "1,234.56", "1.234"
    const cleaned = trimmed.replace(/\s+/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(/,/g, ".")
    const n = parseFloat(cleaned)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

/**
 * Coerce vers boolean strict. Accepte true/false bool, "true"/"false",
 * "oui"/"non", "yes"/"no", "y"/"n", "1"/"0", number 1/0. Tout le reste → null
 * (= info absente, ni oui ni non — different de false explicite).
 */
export function asBool(v: unknown): boolean | null {
  if (v === true) return true
  if (v === false) return false
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null
  if (typeof v === "string") {
    const s = v.trim().toLowerCase()
    if (["true", "t", "1", "oui", "yes", "y"].includes(s)) return true
    if (["false", "f", "0", "non", "no", "n"].includes(s)) return false
  }
  return null
}

/**
 * Trim et retourne string ou undefined. null/undefined/empty/whitespace-only
 * → undefined. Empeche les "" qui passent les checks `!!v`.
 */
export function asString(v: unknown): string | undefined {
  if (typeof v !== "string") {
    if (v == null) return undefined
    // Accepte number/bool en les cast en string
    return String(v)
  }
  const t = v.trim()
  return t.length > 0 ? t : undefined
}

/**
 * Coerce vers array. Accepte :
 *  - array natif
 *  - jsonb array (deja parse cote Supabase)
 *  - string CSV "a,b,c" → ["a","b","c"] (trim chaque item, drop vide)
 *  - string JSON "[\"a\",\"b\"]" → array
 *  - tout le reste → []
 */
export function asArray<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (typeof v === "string") {
    const trimmed = v.trim()
    if (!trimmed) return []
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed)
        return Array.isArray(parsed) ? (parsed as T[]) : []
      } catch {
        return []
      }
    }
    // CSV
    return trimmed.split(",").map(s => s.trim()).filter(s => s.length > 0) as T[]
  }
  return []
}

/**
 * Coerce vers integer (parseInt avec floor). null/non-num → fallback.
 * Utile pour pieces, chambres, age, etc qui doivent etre int en metier.
 */
export function asInt(v: unknown, fallback?: number): number | undefined {
  const n = asNumber(v, fallback)
  if (n === undefined) return undefined
  return Math.floor(n)
}
