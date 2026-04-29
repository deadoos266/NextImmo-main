// V29.B (Paul 2026-04-29) — helpers client-side pour lire profils via API.
// Remplace les ~20 sites qui faisaient `supabase.from("profils").select(...)`
// directement avec la clé anon. Phase 5 RLS : SELECT anon est REVOKE'd
// (migration 036) donc lecture client uniquement via /api/profil/*.

/** GET /api/profil/me — profil complet de la session courante. */
export async function fetchProfilMe(cols?: string[]): Promise<Record<string, unknown> | null> {
  try {
    const url = cols && cols.length > 0
      ? `/api/profil/me?cols=${encodeURIComponent(cols.join(","))}`
      : "/api/profil/me"
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const json = await res.json()
    return json.ok ? (json.profil as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** POST /api/profil/by-emails — profils publics pour une liste d'emails. */
export async function fetchProfilsByEmails(
  emails: string[],
  cols?: string[],
): Promise<Record<string, unknown>[]> {
  if (!Array.isArray(emails) || emails.length === 0) return []
  try {
    const res = await fetch("/api/profil/by-emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails, ...(cols ? { cols } : {}) }),
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.ok && Array.isArray(json.profils) ? json.profils : []
  } catch {
    return []
  }
}

/** GET /api/profil/candidat/[email] — profil complet d'un candidat (proprio
 *  authentifié + le candidat a postulé à une de ses annonces). */
export async function fetchProfilCandidat(email: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`/api/profil/candidat/${encodeURIComponent(email)}`, { cache: "no-store" })
    if (!res.ok) return null
    const json = await res.json()
    return json.ok ? (json.profil as Record<string, unknown>) : null
  } catch {
    return null
  }
}
