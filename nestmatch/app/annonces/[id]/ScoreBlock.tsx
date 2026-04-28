"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { supabase } from "../../../lib/supabase"
import { calculerScore, labelScore, breakdownScore, suggestImprovements } from "../../../lib/matching"
import { useRole } from "../../providers"

export default function ScoreBlock({ annonce }: { annonce: any }) {
  const { data: session, status } = useSession()
  const { role } = useRole()
  const [profil, setProfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session?.user?.email) {
      supabase.from("profils").select("*").eq("email", session.user.email).single()
        .then(({ data }) => { if (data) setProfil(data); setLoading(false) })
    } else if (status !== "loading") {
      setLoading(false)
    }
  }, [session, status])

  // Owner sur sa propre annonce — peu importe le mode actif (Paul 2026-04-27).
  // Avant : check `role === "proprietaire" && proprietaire_email === email`.
  // Bug : si l'user owner avait toggle en mode locataire, il voyait le score
  // de compat (qui calcule sa compat avec SON propre bien — non-sens). Fix :
  // check owner en PRIORITE quel que soit le role courant.
  const isOwnAnnonce = !!session?.user?.email && session.user.email.toLowerCase() === (annonce.proprietaire_email || "").toLowerCase()
  if (isOwnAnnonce) return (
    <div style={{ background: "#F7F4EF", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", marginBottom: 6 }}>Qualité de l&apos;annonce</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: "Photos", ok: Array.isArray(annonce.photos) && annonce.photos.length > 0 },
          { label: "Description", ok: !!annonce.description },
          { label: "DPE renseigné", ok: !!annonce.dpe },
          { label: "Prix renseigné", ok: !!annonce.prix },
        ].map(item => (
          <span key={item.label} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: item.ok ? "#F0FAEE" : "#F7F4EF", color: item.ok ? "#15803d" : "#8a8477" }}>
            {item.ok ? "✓" : "✗"} {item.label}
          </span>
        ))}
      </div>
    </div>
  )
  // Mode proprio actif sur l'annonce d'un autre : rien
  if (session && role === "proprietaire") return null

  if (loading) return (
    <div style={{ background: "#F7F4EF", borderRadius: 12, padding: "14px 16px", marginBottom: 16, textAlign: "center" }}>
      <p style={{ fontSize: 13, color: "#8a8477" }}>Calcul du score...</p>
    </div>
  )

  if (!session) return (
    <div style={{ background: "#F7F4EF", borderRadius: 12, padding: "14px 16px", marginBottom: 16, textAlign: "center" }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#8a8477", marginBottom: 6 }}>Score de compatibilité</p>
      <p style={{ fontSize: 20, fontWeight: 900, color: "#EAE6DF", marginBottom: 4 }}>•••</p>
      <a href="/auth" style={{ fontSize: 12, fontWeight: 700, color: "#111", textDecoration: "underline" }}>Connectez-vous pour voir votre score</a>
    </div>
  )

  if (!profil) return (
    <div style={{ background: "#fffbeb", borderRadius: 12, padding: "14px 16px", marginBottom: 16, textAlign: "center", border: "1px solid #EADFC6" }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#a16207", marginBottom: 6 }}>Score de compatibilité</p>
      <p style={{ fontSize: 12, color: "#a16207", marginBottom: 8 }}>Complétez votre profil pour voir votre score</p>
      <a href="/profil" style={{ display: "inline-block", background: "#111", color: "white", padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>Compléter mon profil</a>
    </div>
  )

  const score = calculerScore(annonce, profil)
  const info = labelScore(score)
  const breakdown = breakdownScore(annonce, profil)
  const suggestions = suggestImprovements(annonce, profil)
  const pct = Math.round(score / 10)

  // V2.8 — breakdown visible par defaut (plus de toggle "voir détails"),
  // bar mini horizontale par categorie + 0..3 suggestions actionnables.
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: info.bg,
        color: info.color,
        padding: "6px 14px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.2px",
      }}>
        <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{pct}&nbsp;%</span>
        <span>de compatibilité</span>
      </div>

      {/* Breakdown par categorie — visible par defaut */}
      {breakdown.length > 0 && (
        <div style={{ marginTop: 14, padding: "14px 16px", background: "#F7F4EF", border: "1px solid #EAE6DF", borderRadius: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 10px" }}>
            Détail du score
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {breakdown.map(item => {
              const ratio = item.max > 0 ? item.pts / item.max : 0
              const widthPct = Math.max(0, Math.min(100, Math.round(ratio * 100)))
              const barColor =
                item.status === "match"   ? "#16a34a" :
                item.status === "partiel" ? "#ea580c" :
                item.status === "miss"    ? "#dc2626" :
                                            "#9ca3af"
              return (
                <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#111", minWidth: 90 }}>
                    {item.label}
                  </span>
                  <div style={{ flex: 1, height: 6, background: "#EAE6DF", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${widthPct}%`, height: "100%", background: barColor, transition: "width .3s ease" }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", minWidth: 60, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {item.pts}/{item.max}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Suggestions actionnables */}
      {suggestions.length > 0 && (
        <div style={{ marginTop: 10, padding: "12px 14px", background: "#fffbeb", border: "1px solid #FDE68A", borderRadius: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#a16207", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 8px" }}>
            Pistes pour améliorer ce match
          </p>
          <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 4 }}>
            {suggestions.map((s, i) => (
              <li key={i} style={{ fontSize: 12, color: "#78350f", lineHeight: 1.5 }}>
                {s.hint}
                {s.impactPts > 0 && <span style={{ fontWeight: 700, marginLeft: 4 }}>(+{s.impactPts} pts)</span>}
              </li>
            ))}
          </ul>
          <a href="/profil#criteres" style={{ display: "inline-block", marginTop: 8, fontSize: 11, fontWeight: 700, color: "#111", textDecoration: "underline", letterSpacing: "0.2px" }}>
            Ajuster mon profil →
          </a>
        </div>
      )}
    </div>
  )
}
