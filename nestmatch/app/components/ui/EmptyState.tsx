import Link from "next/link"

type Props = {
  icon?: React.ReactNode
  title: string
  description?: string
  ctaLabel?: string
  ctaHref?: string
  onCtaClick?: () => void
}

/**
 * Empty state homogène pour toutes les listes vides du site.
 * Card blanche radius 20, centrée, CTA optionnel.
 */
export default function EmptyState({ icon, title, description, ctaLabel, ctaHref, onCtaClick }: Props) {
  const ctaStyle: React.CSSProperties = {
    display: "inline-block",
    background: "#111",
    color: "white",
    padding: "12px 26px",
    borderRadius: 999,
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    border: "none",
    fontFamily: "inherit",
  }
  return (
    <div style={{ background: "white", borderRadius: 20, padding: "40px 32px", textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
      {icon && <div style={{ marginBottom: 14, opacity: 0.6, color: "#9ca3af" }}>{icon}</div>}
      <h3 style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: "0 0 6px" }}>{title}</h3>
      {description && (
        <p style={{ fontSize: 13, color: "#6b7280", maxWidth: 380, margin: "0 auto 18px", lineHeight: 1.5 }}>{description}</p>
      )}
      {ctaLabel && ctaHref && <Link href={ctaHref} style={ctaStyle}>{ctaLabel}</Link>}
      {ctaLabel && onCtaClick && !ctaHref && (
        <button type="button" onClick={onCtaClick} style={ctaStyle}>{ctaLabel}</button>
      )}
    </div>
  )
}
