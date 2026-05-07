// V9.1 (Paul 2026-04-28) — bandeau warning loi Climat & Resilience pour
// les annonces DPE F/G qui seront interdites a la location en 2028 (et G
// deja interdites pour nouveaux baux depuis janvier 2025).
//
// Server component : pas d'interaction, juste affichage conditionnel.
// Style ambre cohérent avec /dossier (palette T : warningBg #FBF6EA,
// warning #a16207, warningLine via #EADFC6).

interface Props {
  dpe?: string | null
}

export default function DpeWarningBanner({ dpe }: Props) {
  if (!dpe) return null
  const upper = dpe.toUpperCase()
  if (upper !== "F" && upper !== "G") return null

  const isG = upper === "G"
  return (
    <div style={{
      background: "#FBF6EA",
      border: "1px solid #EADFC6",
      borderRadius: 14,
      padding: "14px 16px",
      marginBottom: 16,
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      fontFamily: "'DM Sans', sans-serif",
    }}
      role="note"
      aria-label="Information loi Climat et Résilience"
    >
      <span aria-hidden="true" style={{
        flexShrink: 0,
        width: 28, height: 28, borderRadius: "50%",
        background: "#FFFFFF", border: "1px solid #EADFC6",
        color: "#a16207",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginTop: 2,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#a16207", margin: 0, lineHeight: 1.4 }}>
          {isG
            ? "Cette annonce ne pourra plus être proposée à la location."
            : "Cette annonce ne pourra plus être louée à partir de janvier 2028."}
        </p>
        <p style={{ fontSize: 12.5, color: "#6b5314", margin: "4px 0 0", lineHeight: 1.55 }}>
          La loi Climat &amp; Résilience interdit progressivement la location des logements DPE F (interdiction <strong>1<sup>er</sup> janvier 2028</strong>) et DPE G (déjà interdits pour les nouveaux baux depuis <strong>1<sup>er</sup> janvier 2025</strong>).
        </p>
        <a
          href="https://www.legifrance.gouv.fr/loda/id/LEGISCTA000043959654/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: 8,
            fontSize: 12,
            fontWeight: 700,
            color: "#a16207",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          En savoir plus →
        </a>
      </div>
    </div>
  )
}
