"use client"

// V30 (Paul 2026-04-29) — page liste des recherches sauvegardées du
// locataire connecté. User feedback : "je comprends pas où je peux
// reprendre la sauvegardé" → cette page centralise + bouton Relancer.
//
// Storage : localStorage `nestmatch:savedSearches:${email}` (V14 + V19.4).
// Pas de DB — privé au browser, suffisant pour MVP.
//
// Pattern : Mes critères = source explicite des préférences. Recherches
// sauvegardées = snapshots de filtres URL pour relancer rapidement.

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface SavedSearch {
  id: string
  name: string
  ville?: string
  budgetMax?: number | null
  surfaceMin?: string
  surfaceMax?: string
  piecesMin?: number
  meuble?: "oui" | "non" | boolean | null
  parking?: boolean
  balcon?: boolean
  terrasse?: boolean
  jardin?: boolean
  cave?: boolean
  fibre?: boolean
  ascenseur?: boolean
  exterieur?: boolean
  dispo?: boolean
  dpe?: string
  scoreMin?: number
  motCle?: string
  savedAt?: string
}

const T = {
  bg: "#F7F4EF",
  ink: "#111",
  white: "#fff",
  line: "#EAE6DF",
  hairline: "#F0EAE0",
  meta: "#666",
  soft: "#8a8477",
  mutedBg: "#FAF8F3",
}

function formatDateFr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  } catch { return iso }
}

function buildUrl(s: SavedSearch): string {
  const p = new URLSearchParams()
  if (s.ville) p.set("ville", s.ville)
  if (s.budgetMax) p.set("budget_max", String(s.budgetMax))
  if (s.surfaceMin) p.set("surface_min", s.surfaceMin)
  if (s.surfaceMax) p.set("surface_max", s.surfaceMax)
  if (s.piecesMin && s.piecesMin > 0) p.set("pieces_min", String(s.piecesMin))
  if (s.scoreMin && s.scoreMin > 0) p.set("compatibilite_min", String(s.scoreMin))
  if (s.motCle) p.set("q", s.motCle)
  const qs = p.toString()
  return qs ? `/annonces?${qs}` : "/annonces"
}

function summarizeFilters(s: SavedSearch): string[] {
  const chips: string[] = []
  if (s.ville) chips.push(s.ville)
  if (s.budgetMax) chips.push(`≤ ${s.budgetMax.toLocaleString("fr-FR")} €`)
  if (s.surfaceMin) chips.push(`≥ ${s.surfaceMin} m²`)
  if (s.piecesMin && s.piecesMin > 0) chips.push(`${s.piecesMin}+ pièces`)
  if (s.meuble === "oui" || s.meuble === true) chips.push("Meublé")
  if (s.meuble === "non") chips.push("Vide")
  if (s.parking) chips.push("Parking")
  if (s.balcon) chips.push("Balcon")
  if (s.terrasse) chips.push("Terrasse")
  if (s.jardin) chips.push("Jardin")
  if (s.cave) chips.push("Cave")
  if (s.fibre) chips.push("Fibre")
  if (s.ascenseur) chips.push("Ascenseur")
  if (s.dispo) chips.push("Dispo immédiate")
  if (s.dpe) chips.push(`DPE ≤ ${s.dpe}`)
  if (s.scoreMin && s.scoreMin > 0) chips.push(`Match ≥ ${s.scoreMin}%`)
  if (s.motCle) chips.push(`« ${s.motCle} »`)
  return chips.length > 0 ? chips : ["Toutes les annonces"]
}

export default function RecherchesSauvegardeesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [list, setList] = useState<SavedSearch[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth")
      return
    }
    const email = session?.user?.email?.toLowerCase()
    if (!email) return
    try {
      const raw = localStorage.getItem(`nestmatch:savedSearches:${email}`)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) setList(arr)
      }
    } catch { /* noop */ }
    setLoaded(true)
  }, [session, status, router])

  function persist(next: SavedSearch[]) {
    const email = session?.user?.email?.toLowerCase()
    if (!email) return
    try { localStorage.setItem(`nestmatch:savedSearches:${email}`, JSON.stringify(next)) } catch { /* noop */ }
  }

  function relancer(s: SavedSearch) {
    router.push(buildUrl(s))
  }

  function supprimer(id: string) {
    const next = list.filter(s => s.id !== id)
    setList(next)
    persist(next)
    window.dispatchEvent(new CustomEvent("km:toast", {
      detail: { type: "info", title: "Recherche supprimée" },
    }))
  }

  if (status === "loading" || !loaded) {
    return (
      <main style={{ minHeight: "100vh", background: T.bg, fontFamily: "'DM Sans', sans-serif", padding: "40px 20px", textAlign: "center", color: T.soft }}>
        Chargement…
      </main>
    )
  }

  return (
    <main style={{ minHeight: "100vh", background: T.bg, fontFamily: "'DM Sans', sans-serif", paddingBottom: 48 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,300;1,9..144,500&display=swap');`}</style>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2.2px", textTransform: "uppercase", color: T.meta, margin: "0 0 12px" }}>
            Mon espace locataire
          </p>
          <h1 style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontFeatureSettings: "'ss01'",
            fontSize: 44, fontWeight: 300, lineHeight: 0.98,
            margin: 0, color: T.ink, letterSpacing: "-1.2px",
          }}>
            Mes recherches{" "}
            <span style={{ fontStyle: "italic", color: T.meta }}>sauvegardées</span>
          </h1>
          <p style={{ fontSize: 14, color: T.meta, margin: "14px 0 0", lineHeight: 1.55, maxWidth: 540 }}>
            Tes recherches favorites avec leurs filtres. Relance-les en un clic depuis ici.
          </p>
        </div>

        {/* Empty state */}
        {list.length === 0 && (
          <div style={{
            background: T.white, borderRadius: 20, padding: "32px 28px",
            border: `1px solid ${T.line}`, textAlign: "center" as const,
          }}>
            <p style={{ fontSize: 14, color: T.ink, fontWeight: 600, margin: "0 0 6px" }}>
              Aucune recherche sauvegardée pour le moment
            </p>
            <p style={{ fontSize: 13, color: T.meta, margin: "0 0 18px", lineHeight: 1.5 }}>
              Sur la page Annonces, configure tes filtres (ville, budget, surface…) puis clique
              « Sauvegarder cette recherche » pour la retrouver ici.
            </p>
            <Link href="/annonces" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: T.ink, color: T.white, textDecoration: "none",
              borderRadius: 999, padding: "11px 22px",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
            }}>
              Aller aux annonces →
            </Link>
          </div>
        )}

        {/* Liste */}
        {list.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {list.map(s => {
              const chips = summarizeFilters(s)
              return (
                <li key={s.id} style={{
                  background: T.white, borderRadius: 18,
                  border: `1px solid ${T.line}`,
                  padding: "18px 20px",
                  display: "flex", flexDirection: "column", gap: 12,
                }}>
                  {/* Header card */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{
                        fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic",
                        fontWeight: 500, fontSize: 22, color: T.ink,
                        margin: 0, letterSpacing: "-0.4px", lineHeight: 1.2,
                      }}>
                        {s.name}
                      </h2>
                      {s.savedAt && (
                        <p style={{ fontSize: 11, color: T.soft, margin: "4px 0 0", letterSpacing: "0.2px" }}>
                          Sauvegardée le {formatDateFr(s.savedAt)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => supprimer(s.id)}
                      aria-label={`Supprimer la recherche ${s.name}`}
                      style={{
                        background: "transparent", border: `1px solid ${T.line}`,
                        color: T.soft, borderRadius: 999,
                        padding: "6px 12px", fontSize: 11.5, fontWeight: 600,
                        fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
                      }}
                    >
                      Supprimer
                    </button>
                  </div>

                  {/* Filtres en chips */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {chips.map((c, i) => (
                      <span key={i} style={{
                        background: T.mutedBg, color: T.ink,
                        border: `1px solid ${T.line}`,
                        borderRadius: 999, padding: "5px 12px",
                        fontSize: 12, fontWeight: 500,
                      }}>
                        {c}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => relancer(s)}
                      style={{
                        background: T.ink, color: T.white, border: "none",
                        borderRadius: 999, padding: "10px 22px",
                        fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                        cursor: "pointer", whiteSpace: "nowrap",
                      }}
                    >
                      Relancer cette recherche →
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
