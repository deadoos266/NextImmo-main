"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { supabase } from "../../../lib/supabase"
import { calculerScore, labelScore, expliquerScore } from "../../../lib/matching"
import { useRole } from "../../providers"

export default function ScoreBlock({ annonce }: { annonce: any }) {
  const { data: session, status } = useSession()
  const { role } = useRole()
  const [profil, setProfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    if (session?.user?.email) {
      supabase.from("profils").select("*").eq("email", session.user.email).single()
        .then(({ data }) => { if (data) setProfil(data); setLoading(false) })
    } else if (status !== "loading") {
      setLoading(false)
    }
  }, [session, status])

  // Côté propriétaire
  if (session && role === "proprietaire") {
    // Qualité uniquement sur sa propre annonce
    if (annonce.proprietaire_email === session.user?.email) return (
      <div style={{ background: "#f9fafb", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>Qualité de l'annonce</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Photos", ok: false },
            { label: "Description", ok: !!annonce.description },
            { label: "DPE renseigné", ok: !!annonce.dpe },
            { label: "Prix renseigné", ok: !!annonce.prix },
          ].map(item => (
            <span key={item.label} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: item.ok ? "#dcfce7" : "#f3f4f6", color: item.ok ? "#16a34a" : "#9ca3af" }}>
              {item.ok ? "✓" : "✗"} {item.label}
            </span>
          ))}
        </div>
      </div>
    )
    // Annonce d'un autre propriétaire : rien à afficher
    return null
  }

  if (loading) return (
    <div style={{ background: "#f9fafb", borderRadius: 12, padding: "14px 16px", marginBottom: 16, textAlign: "center" }}>
      <p style={{ fontSize: 13, color: "#9ca3af" }}>Calcul du score...</p>
    </div>
  )

  if (!session) return (
    <div style={{ background: "#f9fafb", borderRadius: 12, padding: "14px 16px", marginBottom: 16, textAlign: "center" }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>Score de compatibilité</p>
      <p style={{ fontSize: 20, fontWeight: 900, color: "#d1d5db", marginBottom: 4 }}>•••</p>
      <a href="/auth" style={{ fontSize: 12, fontWeight: 700, color: "#111", textDecoration: "underline" }}>Connectez-vous pour voir votre score</a>
    </div>
  )

  if (!profil) return (
    <div style={{ background: "#fffbeb", borderRadius: 12, padding: "14px 16px", marginBottom: 16, textAlign: "center", border: "1px solid #fde68a" }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>Score de compatibilité</p>
      <p style={{ fontSize: 12, color: "#92400e", marginBottom: 8 }}>Complétez votre profil pour voir votre score</p>
      <a href="/profil" style={{ display: "inline-block", background: "#111", color: "white", padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>Compléter mon profil</a>
    </div>
  )

  const score = calculerScore(annonce, profil)
  const info = labelScore(score)
  const raisons = expliquerScore(annonce, profil)

  return (
    <div style={{ background: info.bg, borderRadius: 12, padding: "16px", marginBottom: 16, border: `1.5px solid ${info.color}22` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: info.color, textTransform: "uppercase", letterSpacing: "0.5px" }}>Compatibilité</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: info.color }}>{info.label}</p>
        </div>
        <p style={{ fontSize: 36, fontWeight: 900, color: info.color, lineHeight: 1 }}>{Math.round(score / 10)}%</p>
      </div>
      <div style={{ background: "rgba(0,0,0,0.08)", borderRadius: 999, height: 6, marginBottom: 10 }}>
        <div style={{ background: info.color, borderRadius: 999, height: 6, width: `${Math.round(score / 10)}%`, transition: "width 0.5s" }} />
      </div>
      {raisons.length > 0 && (
        <>
          <button onClick={() => setShowDetails(!showDetails)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: info.color, padding: 0, fontFamily: "inherit" }}>
            {showDetails ? "Masquer les détails ↑" : "Voir les détails ↓"}
          </button>
          {showDetails && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              {raisons.map((r, i) => (
                <p key={i} style={{ fontSize: 12, color: r.startsWith("✓") ? "#16a34a" : "#dc2626", fontWeight: 500 }}>{r}</p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
