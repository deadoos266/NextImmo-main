"use client"

// V11.7 (Paul 2026-04-28) — wrapper adaptatif autour de QualiteAnnonceBadge
// qui adapte la position et le rendu selon le viewer + viewport :
//   - Owner : grosse card en TOP de la fiche (priorite info "qualite de
//     mon annonce, comment l'ameliorer")
//   - Locataire mobile : pill compact en BOTTOM, click → modal breakdown
//   - Locataire desktop : grosse card en BOTTOM (espace dispo)
//
// Le composant gere la visibilite via la prop `placement` ("top" ou
// "bottom") et la detection client-side du role + viewport.

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { computeQualiteAnnonce, type QualiteInput } from "../../../lib/qualiteAnnonce"
import QualiteAnnonceBadge from "./QualiteAnnonceBadge"

interface Props {
  annonce: QualiteInput
  proprietaireEmail?: string | null
  placement: "top" | "bottom"
}

export default function QualiteAnnonceBadgeAdaptive({ annonce, proprietaireEmail, placement }: Props) {
  const { data: session } = useSession()
  const [isMobile, setIsMobile] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(max-width: 767px)")
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  const isOwner = !!session?.user?.email && !!proprietaireEmail
    && session.user.email.toLowerCase() === proprietaireEmail.toLowerCase()

  // Routing visibilite par placement :
  // - top : visible uniquement pour l'owner (sa card prioritaire)
  // - bottom : visible uniquement pour les locataires (apres tous les contenus)
  if (placement === "top" && !isOwner) return null
  if (placement === "bottom" && isOwner) return null

  // Owner ou desktop locataire : grosse card identique a V9.3 originale.
  if (isOwner || !isMobile) {
    return <QualiteAnnonceBadge annonce={annonce} />
  }

  // Locataire mobile : pill compact + click expand vers modal breakdown.
  const r = computeQualiteAnnonce(annonce)
  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={`Qualité de l'annonce : ${r.score} sur 100, ${r.label}. Cliquer pour le détail.`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 999,
          background: "#FAF8F3", border: "1px solid #F0EAE0",
          fontSize: 12.5, fontWeight: 500, color: "#6b6559",
          marginBottom: 16, cursor: "pointer",
          fontFamily: "inherit",
          minHeight: 44,
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 13, color: r.color }}>✦</span>
        <span style={{ color: "#8a8477", letterSpacing: "1px", textTransform: "uppercase", fontSize: 10, fontWeight: 700 }}>
          Qualité
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: r.color }}>
          {r.score}/100
        </span>
        <span style={{ opacity: 0.7 }}>·</span>
        <span>{r.label}</span>
        <span aria-hidden="true" style={{ marginLeft: 4, fontSize: 10, color: "#8a8477" }}>›</span>
      </button>

      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Détail qualité annonce"
          onClick={() => setExpanded(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff",
              borderTopLeftRadius: 20, borderTopRightRadius: 20,
              maxWidth: 480, width: "100%",
              padding: "10px 0 calc(20px + env(safe-area-inset-bottom, 0px))",
              maxHeight: "80vh", overflowY: "auto",
              boxShadow: "0 -8px 30px rgba(0,0,0,0.18)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }} aria-hidden="true">
              <div style={{ width: 40, height: 4, borderRadius: 999, background: "#EAE6DF" }} />
            </div>
            <div style={{ padding: "0 20px 20px" }}>
              <QualiteAnnonceBadge annonce={annonce} />
              {/* Breakdown details */}
              <p style={{ fontSize: 10.5, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: "8px 0 8px" }}>
                Détail par critère
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {r.parts.map(p => (
                  <li key={p.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#FAF8F3", borderRadius: 10, fontSize: 12.5 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#111" }}>
                      <span aria-hidden="true" style={{ color: p.ok ? "#15803d" : "#8a8477" }}>{p.ok ? "✓" : "○"}</span>
                      {p.label}
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: p.ok ? "#15803d" : "#8a8477" }}>
                      {p.pts}/{p.max}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                style={{
                  marginTop: 16, width: "100%",
                  background: "#111", color: "#fff", border: "none",
                  borderRadius: 999, padding: "12px 20px",
                  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  cursor: "pointer", minHeight: 48,
                  WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
