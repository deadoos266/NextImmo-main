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
  const raisons = expliquerScore(annonce, profil)
  const pct = Math.round(score / 10)

  // Rendu compact "chip" style bundle design — bg vert pâle #DCFCE7 +
  // color #16A34A si bon score, sinon palette info. Bouton "détails" reste
  // accessible en dessous pour afficher la liste des raisons ✓/✗.
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
      {raisons.length > 0 && (
        <>
          <button onClick={() => setShowDetails(!showDetails)}
            style={{ display: "block", marginTop: 8, background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#8a8477", padding: 0, fontFamily: "inherit", textDecoration: "underline" }}>
            {showDetails ? "Masquer les détails" : "Voir le détail du score"}
          </button>
          {showDetails && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              {raisons.map((r, i) => (
                <p key={i} style={{ fontSize: 12, color: r.startsWith("✓") ? "#15803d" : "#b91c1c", fontWeight: 500 }}>{r}</p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
