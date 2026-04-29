/**
 * V43 — Favoris scopés par user_email.
 *
 * Avant V43 : localStorage clé globale "nestmatch_favoris" partagée entre
 * tous les comptes du même browser (privacy leak entre comptes).
 *
 * Après V43 :
 *   - localStorage clé scopée "nestmatch_favoris:<email>" (cache local pour
 *     UI offline-first et perf).
 *   - DB Supabase table `favoris` source de vérité (sync via /api/favoris).
 *   - User non-connecté : favoris en clé "nestmatch_favoris:anon" (scope
 *     local browser, jamais syncé en DB).
 *
 * API restée synchrone par compat avec les callers existants (ListingCard,
 * etc.) — l'init async est gérée par useFavorisSync au niveau du Provider.
 */

const LEGACY_KEY = "nestmatch_favoris"

let activeEmail: string | null = null

function keyFor(email: string | null): string {
  return email ? `nestmatch_favoris:${email}` : "nestmatch_favoris:anon"
}

/**
 * Définit l'email actif pour les opérations favoris ultérieures. Appelé
 * par useFavorisSync (Providers) au mount + à chaque changement de session.
 *
 * Quand l'email change vers un nouvel user, on ne lit pas l'ancien cache
 * (chaque user a sa propre clé). Le legacy "nestmatch_favoris" est purgé
 * pour éviter la confusion.
 */
export function setActiveFavorisEmail(email: string | null): void {
  activeEmail = email
  if (typeof window !== "undefined") {
    try {
      // Nettoyage one-shot du legacy global key (V43 migration).
      const legacy = window.localStorage.getItem(LEGACY_KEY)
      if (legacy !== null) {
        window.localStorage.removeItem(LEGACY_KEY)
      }
    } catch { /* ignore */ }
  }
}

/**
 * Écrase le cache local des favoris pour l'user actif (utilisé après
 * sync depuis /api/favoris au login).
 */
export function setFavorisLocal(ids: number[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(keyFor(activeEmail), JSON.stringify(Array.from(new Set(ids))))
  } catch { /* quota OK, on ignore */ }
}

export function getFavoris(): number[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(window.localStorage.getItem(keyFor(activeEmail)) ?? "[]")
  } catch {
    return []
  }
}

export function isFavori(id: number): boolean {
  return getFavoris().includes(id)
}

/**
 * Toggle local + sync API fire-and-forget si user connecté.
 * Retourne true si l'annonce vient d'être ajoutée, false si retirée.
 */
export function toggleFavori(id: number): boolean {
  const current = getFavoris()
  const exists = current.includes(id)
  const next = exists ? current.filter(x => x !== id) : [...current, id]
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(keyFor(activeEmail), JSON.stringify(next)) } catch { /* ignore */ }
  }
  // Sync API uniquement si user connecté (sinon favoris locaux anon-only).
  if (activeEmail) {
    if (exists) {
      void fetch(`/api/favoris?annonceId=${id}`, { method: "DELETE" }).catch(() => { /* offline OK */ })
    } else {
      void fetch("/api/favoris", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annonceId: id }),
      }).catch(() => { /* offline OK */ })
    }
  }
  return !exists
}

/**
 * Clear du cache local pour le user en cours (utilisé au signout).
 */
export function clearLocalFavoris(): void {
  if (typeof window === "undefined") return
  try { window.localStorage.removeItem(keyFor(activeEmail)) } catch { /* ignore */ }
}
