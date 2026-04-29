"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { calculerScore, estExclu } from "../../lib/matching"
import { useResponsive } from "../hooks/useResponsive"
import { km, KMEyebrow, KMHeading, KMCard, KMMatchRing } from "../components/ui/km"

/**
 * Recommandations de villes basées sur les critères du locataire.
 * Pour chaque ville, calcule le nombre d'annonces compatibles + le score moyen.
 * Top 8 affiché.
 */

type Reco = {
  ville: string
  totalAnnonces: number
  compatibles: number
  scoreMoyen: number
  prixMedian: number
}

export default function Recommandations() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [profil, setProfil] = useState<any>(null)
  const [recos, setRecos] = useState<Reco[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth"); return }
    if (!session?.user?.email) return
    load()
  }, [session, status])

  async function load() {
    const email = session!.user!.email!
    void email
    // V29.B — /api/profil/me (RLS Phase 5)
    const meRes = await fetch("/api/profil/me", { cache: "no-store" })
    const meJson = await meRes.json().catch(() => ({}))
    const p = meJson.ok ? meJson.profil : null
    setProfil(p)

    // On ignore le filtre ville stricte pour découvrir d'autres zones
    const profilSouple = p ? { ...p, mode_localisation: "souple" } : null

    const { data: ann } = await supabase.from("annonces").select("*").eq("statut", "disponible").eq("is_test", false)
    if (!ann) { setLoading(false); return }

    // Regrouper par ville + calculer compatibilités
    const villes = new Map<string, { annonces: any[]; scores: number[] }>()
    for (const a of ann) {
      if (!a.ville) continue
      if (profilSouple && estExclu(a, profilSouple)) continue
      const score = profilSouple ? calculerScore(a, profilSouple) : 500
      if (!villes.has(a.ville)) villes.set(a.ville, { annonces: [], scores: [] })
      villes.get(a.ville)!.annonces.push(a)
      villes.get(a.ville)!.scores.push(score)
    }

    const list: Reco[] = Array.from(villes.entries()).map(([ville, v]) => {
      const scoreMoyen = v.scores.reduce((s, x) => s + x, 0) / v.scores.length
      const compatibles = v.scores.filter(s => s >= 600).length
      return {
        ville,
        totalAnnonces: v.annonces.length,
        compatibles,
        scoreMoyen: Math.round(scoreMoyen),
        prixMedian: median(v.annonces.map(a => Number(a.prix)).filter(n => !isNaN(n) && n > 0)),
      }
    })
      .filter(r => r.compatibles > 0 || r.totalAnnonces > 0)
      .sort((a, b) => b.scoreMoyen - a.scoreMoyen)
      .slice(0, 8)

    setRecos(list)
    setLoading(false)
  }

  function median(arr: number[]): number {
    if (arr.length === 0) return 0
    const s = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid]
  }

  if (status === "loading" || loading) return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", color: km.muted,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      fontSize: 13, textTransform: "uppercase", letterSpacing: "1.2px",
    }}>Chargement…</div>
  )

  return (
    <main style={{
      minHeight: "100vh",
      background: km.beige,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      padding: isMobile ? "24px 16px" : "40px",
    }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <Link href="/annonces" style={{
          fontSize: 11, color: km.muted, textDecoration: "none",
          textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 700,
        }}>← Retour aux annonces</Link>

        {/* Hero éditorial */}
        <div style={{ marginTop: 20, marginBottom: 32 }}>
          <KMEyebrow style={{ marginBottom: 14 }}>Découverte · Matching ville</KMEyebrow>
          <KMHeading as="h1" size={isMobile ? 32 : 42}>
            Villes recommandées pour vous
          </KMHeading>
          <p style={{
            fontSize: 14, color: km.muted, marginTop: 12, lineHeight: 1.6,
            maxWidth: 560,
          }}>
            Villes classées par compatibilité moyenne avec votre dossier. Utile pour découvrir des zones auxquelles vous n&apos;aviez pas pensé.
          </p>
        </div>

        {!profil && (
          <div style={{
            background: km.warnBg, border: `1px solid ${km.warnLine}`,
            borderRadius: 14, padding: "14px 18px", marginBottom: 20,
            color: km.warnText, fontSize: 13, lineHeight: 1.5,
          }}>
            Complétez votre <Link href="/profil" style={{ color: km.warnText, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>profil de recherche</Link> pour obtenir des recommandations personnalisées.
          </div>
        )}

        {recos.length === 0 ? (
          <KMCard padding={48} style={{ textAlign: "center" }}>
            <KMHeading as="h2" size={20} style={{ marginBottom: 10 }}>Pas encore de recommandations</KMHeading>
            <p style={{ fontSize: 14, color: km.muted, margin: 0 }}>Nous n&apos;avons pas trouvé d&apos;annonces compatibles avec vos critères.</p>
          </KMCard>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {recos.map((r, i) => {
              const rank = i + 1
              const topTier = rank <= 3
              const pct = Math.round(r.scoreMoyen / 10)
              return (
                <Link key={r.ville} href={`/annonces?ville=${encodeURIComponent(r.ville)}`}
                  style={{
                    background: km.white,
                    border: `1px solid ${km.line}`,
                    borderRadius: 18,
                    padding: "18px 22px",
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    textDecoration: "none",
                    color: km.ink,
                    transition: "box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(17,17,17,0.06)"
                    ;(e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"
                    ;(e.currentTarget as HTMLElement).style.borderColor = km.ink
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = "none"
                    ;(e.currentTarget as HTMLElement).style.transform = "none"
                    ;(e.currentTarget as HTMLElement).style.borderColor = km.line
                  }}>
                  {/* Rang en Fraunces italic */}
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: topTier ? km.ink : km.beige,
                    color: topTier ? km.white : km.muted,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
                    fontStyle: "italic", fontWeight: 500,
                    fontSize: 18, letterSpacing: "-0.5px",
                    flexShrink: 0,
                  }}>
                    {rank}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
                      fontStyle: "italic", fontWeight: 500,
                      fontSize: 20, letterSpacing: "-0.3px",
                      margin: 0, color: km.ink,
                    }}>{r.ville}</p>
                    <p style={{ fontSize: 12, color: km.muted, margin: "4px 0 0", lineHeight: 1.45 }}>
                      {r.compatibles > 0
                        ? `${r.compatibles} annonce${r.compatibles > 1 ? "s" : ""} compatible${r.compatibles > 1 ? "s" : ""}`
                        : `${r.totalAnnonces} annonce${r.totalAnnonces > 1 ? "s" : ""} disponible${r.totalAnnonces > 1 ? "s" : ""}`}
                      {r.prixMedian > 0 && <> · Loyer médian {r.prixMedian} €/mois</>}
                    </p>
                  </div>

                  {/* Ring de match KM */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <KMMatchRing score={pct} size={52} />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
