"use client"
import { useEffect, useState } from "react"

interface Props {
  biens: any[]
  candidatures: any[]
  visites: any[]
  clicsParBien: Record<number, number>
}

interface Stage {
  label: string
  count: number
  color: string
  desc: string
}

/**
 * Pipeline candidats sous forme de funnel horizontal.
 * 5 étapes : Annonces → Intéressés → Dossiers → Visites → Baux signés
 * Affiche les compteurs absolus et le taux de conversion entre chaque étape.
 */
export default function PipelineFunnel({ biens, candidatures, visites, clicsParBien }: Props) {
  const [dossiersCount, setDossiersCount] = useState<number | null>(null)

  useEffect(() => {
    // Candidats ayant envoyé leur dossier (messages avec préfixe DOSSIER_CARD)
    const emailsWithDossier = new Set<string>()
    candidatures.forEach(c => {
      if (typeof c.contenu === "string" && c.contenu.startsWith("[DOSSIER_CARD]")) {
        emailsWithDossier.add(c.from_email)
      }
    })
    setDossiersCount(emailsWithDossier.size)
  }, [candidatures])

  const totalBiens = biens.length
  const totalClics = Object.values(clicsParBien).reduce((s, n) => s + n, 0)
  const totalCandidatures = candidatures.length
  const totalVisites = visites.length
  const baux = biens.filter(b => b.statut === "loué" && b.locataire_email).length

  const stages: Stage[] = [
    { label: "Annonces publiées",       count: totalBiens,         color: "#111",    desc: "Biens en ligne" },
    { label: "Intéressés",              count: totalClics,         color: "#2563eb", desc: "Clics uniques sur vos annonces" },
    { label: "Candidatures",            count: totalCandidatures,  color: "#7c3aed", desc: "Messages reçus" },
    { label: "Dossiers partagés",       count: dossiersCount ?? 0, color: "#db2777", desc: "Candidats ayant envoyé leur dossier" },
    { label: "Visites",                 count: totalVisites,       color: "#a16207", desc: "Visites organisées" },
    { label: "Baux signés",             count: baux,               color: "#15803d", desc: "Biens effectivement loués" },
  ]

  // Largeur relative au max pour le funnel (toutes les étapes > 0 gardent au moins 18% de largeur pour rester lisibles)
  const maxCount = Math.max(...stages.map(s => s.count), 1)
  const minWidthPct = 22
  const widthPct = (count: number) => {
    if (maxCount === 0) return minWidthPct
    const ratio = count / maxCount
    return Math.max(minWidthPct, Math.round(ratio * 100))
  }

  function conversionPct(currentCount: number, previousCount: number): string | null {
    if (previousCount === 0) return null
    const pct = Math.round((currentCount / previousCount) * 100)
    return `${pct}%`
  }

  return (
    <div style={{ background: "white", borderRadius: 20, padding: 28, marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.3px" }}>Pipeline candidats</h2>
          <p style={{ fontSize: 13, color: "#8a8477" }}>Parcours global depuis la publication jusqu&apos;à la signature du bail</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px" }}>Conversion globale</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: baux > 0 ? "#15803d" : "#8a8477", letterSpacing: "-0.5px" }}>
            {totalClics > 0 ? `${Math.round((baux / totalClics) * 100)}%` : "—"}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
        {stages.map((stage, i) => {
          const w = widthPct(stage.count)
          const convLabel = i > 0 ? conversionPct(stage.count, stages[i - 1].count) : null
          return (
            <div key={stage.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Barre funnel */}
              <div style={{ flex: 1, position: "relative", height: 56 }}>
                <div
                  style={{
                    position: "absolute",
                    left: `${(100 - w) / 2}%`,
                    width: `${w}%`,
                    height: "100%",
                    background: stage.color,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 18px",
                    color: "white",
                    transition: "width 0.4s ease",
                    boxShadow: `0 4px 12px ${stage.color}33`,
                  }}
                >
                  <div style={{ overflow: "hidden", minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stage.label}</p>
                    <p style={{ fontSize: 11, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stage.desc}</p>
                  </div>
                  <p style={{ fontSize: 22, fontWeight: 800, flexShrink: 0, marginLeft: 12, letterSpacing: "-0.5px" }}>{stage.count}</p>
                </div>
              </div>

              {/* Taux de conversion à droite */}
              <div style={{ width: 72, flexShrink: 0, textAlign: "center" }}>
                {convLabel ? (
                  <>
                    <p style={{ fontSize: 15, fontWeight: 800, color: stage.color, lineHeight: 1 }}>{convLabel}</p>
                    <p style={{ fontSize: 10, color: "#8a8477", marginTop: 2 }}>vs étape précédente</p>
                  </>
                ) : (
                  <p style={{ fontSize: 10, color: "#EAE6DF" }}>départ</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {totalClics === 0 && (
        <div style={{ marginTop: 16, padding: "12px 16px", background: "#F7F4EF", borderRadius: 12, textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "#8a8477" }}>
            Pas encore de trafic sur vos annonces. Vos données apparaîtront ici dès les premières visites sur la plateforme.
          </p>
        </div>
      )}
    </div>
  )
}
