"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { calculerScore, estExclu } from "../../lib/matching"
import { useResponsive } from "../hooks/useResponsive"

/**
 * Recommandations de villes basées sur les critères du locataire.
 * Pour chaque ville, calcule le nombre d'annonces compatibles + le score moyen.
 * Top 5 affiché.
 */

export default function Recommandations() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [profil, setProfil] = useState<any>(null)
  const [recos, setRecos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth"); return }
    if (!session?.user?.email) return
    load()
  }, [session, status])

  async function load() {
    const email = session!.user!.email!
    const { data: p } = await supabase.from("profils").select("*").eq("email", email).single()
    setProfil(p)

    // On ignore le filtre ville stricte pour découvrir d'autres zones
    const profilSouple = p ? { ...p, mode_localisation: "souple" } : null

    const { data: ann } = await supabase.from("annonces").select("*").eq("statut", "disponible")
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

    const list = Array.from(villes.entries()).map(([ville, v]) => {
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#6b7280", fontFamily: "'DM Sans', sans-serif" }}>Chargement...</div>
  )

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <Link href="/annonces" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>&larr; Retour aux annonces</Link>

        <div style={{ marginTop: 16, marginBottom: 28 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>Villes recommandées pour vous</h1>
          <p style={{ fontSize: 14, color: "#6b7280", marginTop: 6, lineHeight: 1.6 }}>
            Villes classées par compatibilité moyenne avec votre dossier. Utile pour découvrir des zones auxquelles vous n&apos;aviez pas pensé.
          </p>
        </div>

        {!profil && (
          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 14, padding: "14px 18px", marginBottom: 20, color: "#9a3412", fontSize: 13, lineHeight: 1.5 }}>
            Complétez votre <Link href="/profil" style={{ color: "#9a3412", fontWeight: 700 }}>profil de recherche</Link> pour obtenir des recommandations personnalisées.
          </div>
        )}

        {recos.length === 0 ? (
          <div style={{ background: "white", borderRadius: 20, padding: 48, textAlign: "center" }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Pas encore de recommandations</p>
            <p style={{ fontSize: 14, color: "#9ca3af" }}>Nous n&apos;avons pas trouvé d&apos;annonces compatibles avec vos critères.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recos.map((r, i) => {
              const scoreColor = r.scoreMoyen >= 750 ? "#16a34a" : r.scoreMoyen >= 600 ? "#ea580c" : "#6b7280"
              return (
                <Link key={r.ville} href={`/annonces?ville=${encodeURIComponent(r.ville)}`}
                  style={{ background: "white", borderRadius: 18, padding: "18px 22px", display: "flex", alignItems: "center", gap: 16, textDecoration: "none", color: "#111", transition: "box-shadow 0.15s, transform 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; (e.currentTarget as HTMLElement).style.transform = "none" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: i < 3 ? "#111" : "#f3f4f6", color: i < 3 ? "white" : "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{r.ville}</p>
                    <p style={{ fontSize: 13, color: "#6b7280", margin: "2px 0 0" }}>
                      {r.compatibles > 0
                        ? `${r.compatibles} annonce${r.compatibles > 1 ? "s" : ""} compatible${r.compatibles > 1 ? "s" : ""}`
                        : `${r.totalAnnonces} annonce${r.totalAnnonces > 1 ? "s" : ""} disponible${r.totalAnnonces > 1 ? "s" : ""}`}
                      {r.prixMedian > 0 && <> · Loyer médian {r.prixMedian} €/mois</>}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ fontSize: 22, fontWeight: 800, color: scoreColor, letterSpacing: "-0.5px", margin: 0 }}>{Math.round(r.scoreMoyen / 10)}%</p>
                    <p style={{ fontSize: 10, color: "#9ca3af", margin: 0, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Compat. moy.</p>
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
