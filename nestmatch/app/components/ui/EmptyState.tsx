import Link from "next/link"

type Props = {
  icon?: React.ReactNode
  title: string
  description?: string
  ctaLabel?: string
  ctaHref?: string
  onCtaClick?: () => void
  /** CTA secondaire optionnel (outline) — placé à droite du CTA principal. */
  secondaryCtaLabel?: string
  secondaryCtaHref?: string
  onSecondaryCtaClick?: () => void
}

/**
 * Empty state homogène pour toutes les listes vides du site — calque handoff
 * editorial : card blanche hairline beige, titre Fraunces italic, sous-titre
 * #8a8477, CTA pill noir uppercase letterSpacing 0.3px.
 *
 * Utilisé partout : dashboard proprio onglets vides, favoris, candidatures,
 * visites, etc. Un refactor ici touche tous les ecrans "vide".
 */
export default function EmptyState({
  icon, title, description,
  ctaLabel, ctaHref, onCtaClick,
  secondaryCtaLabel, secondaryCtaHref, onSecondaryCtaClick,
}: Props) {
  const ctaStyle: React.CSSProperties = {
    display: "inline-block",
    background: "#111",
    color: "#fff",
    padding: "12px 26px",
    borderRadius: 999,
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
    border: "none",
    fontFamily: "inherit",
    letterSpacing: "0.3px",
  }
  const outlineStyle: React.CSSProperties = {
    display: "inline-block",
    background: "#fff",
    color: "#111",
    padding: "11px 25px",
    borderRadius: 999,
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
    border: "1px solid #111",
    fontFamily: "inherit",
    letterSpacing: "0.3px",
  }
  // Fraunces est déjà chargé globalement via next/font dans app/layout.tsx,
  // pas besoin de @import url redondant qui ralentit le first paint.
  return (
    <>
      <div style={{
        background: "#fff",
        border: "1px solid #EAE6DF",
        borderRadius: 20,
        padding: "56px 32px",
        textAlign: "center",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
      }}>
        {icon && (
          <div style={{
            marginBottom: 18,
            color: "#8a8477",
            display: "flex",
            justifyContent: "center",
            // Cercle beige clair derrière l'icône pour donner de la présence
            // visuelle sans casser la palette éditoriale.
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "#F7F4EF",
              border: "1px solid #EAE6DF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              {icon}
            </div>
          </div>
        )}
        <h3 style={{
          fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 24,
          lineHeight: 1.2,
          color: "#111",
          margin: "0 0 10px",
          letterSpacing: "-0.3px",
        }}>
          {title}
        </h3>
        {description && (
          <p style={{ fontSize: 13, color: "#8a8477", maxWidth: 420, margin: "0 auto 22px", lineHeight: 1.6 }}>
            {description}
          </p>
        )}
        <div style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {ctaLabel && ctaHref && <Link href={ctaHref} style={ctaStyle}>{ctaLabel}</Link>}
          {ctaLabel && onCtaClick && !ctaHref && (
            <button type="button" onClick={onCtaClick} style={ctaStyle}>{ctaLabel}</button>
          )}
          {secondaryCtaLabel && secondaryCtaHref && <Link href={secondaryCtaHref} style={outlineStyle}>{secondaryCtaLabel}</Link>}
          {secondaryCtaLabel && onSecondaryCtaClick && !secondaryCtaHref && (
            <button type="button" onClick={onSecondaryCtaClick} style={outlineStyle}>{secondaryCtaLabel}</button>
          )}
        </div>
      </div>
    </>
  )
}
