// V9.3 (Paul 2026-04-28) — badge qualite annonce affiche sur fiche
// /annonces/[id] juste sous le ScoreBlock. Pour le candidat : signal "ce
// proprio a soigne son annonce" → confiance + intention. Pour le proprio
// (cote /proprietaire/ajouter wizard) : feedback live en mode preview.

import { computeQualiteAnnonce, type QualiteInput } from "../../../lib/qualiteAnnonce"

export default function QualiteAnnonceBadge({ annonce, compact = false }: { annonce: QualiteInput; compact?: boolean }) {
  const r = computeQualiteAnnonce(annonce)

  if (compact) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 11px", borderRadius: 999,
        background: r.bg, color: r.color, border: `1px solid ${r.border}`,
        fontSize: 11.5, fontWeight: 700, letterSpacing: "0.1px",
        whiteSpace: "nowrap",
      }}>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.score}/100</span>
        <span style={{ opacity: 0.85, fontWeight: 500 }}>· {r.label}</span>
      </span>
    )
  }

  return (
    <div style={{
      background: r.bg,
      border: `1px solid ${r.border}`,
      borderRadius: 14,
      padding: "12px 14px",
      marginBottom: 16,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontFeatureSettings: "'ss01'",
            fontSize: 28,
            fontWeight: 400,
            color: r.color,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.5px",
            lineHeight: 1,
          }}>
            {r.score}
            <span style={{ fontSize: 14, marginLeft: 1, opacity: 0.6 }}>/100</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: r.color, letterSpacing: "0.1px" }}>
            {r.label}
          </span>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: r.color, textTransform: "uppercase", letterSpacing: "1.4px", opacity: 0.75 }}>
          Qualité de l&apos;annonce
        </span>
      </div>
      {/* Progress bar fine */}
      <div style={{
        marginTop: 10,
        height: 4,
        background: "rgba(0,0,0,0.06)",
        borderRadius: 999,
        overflow: "hidden",
      }} role="progressbar" aria-valuenow={r.score} aria-valuemin={0} aria-valuemax={100}>
        <div style={{
          width: `${r.score}%`,
          height: "100%",
          background: r.color,
          borderRadius: 999,
          transition: "width 300ms ease",
        }} />
      </div>
    </div>
  )
}
