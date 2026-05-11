import { km } from "../ui/km"

/**
 * V85 — Header standard pour les pages admin (eyebrow + h1 Fraunces + subtitle).
 * Server component sans state, juste du style cohérent.
 */
export default function AdminPageHeader({
  eyebrow = "Admin · Interne",
  title,
  subtitle,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
}) {
  return (
    <header style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.6, margin: 0 }}>
        {eyebrow}
      </p>
      <h1 style={{
        fontFamily: "var(--font-fraunces), 'Fraunces', serif",
        fontStyle: "italic", fontWeight: 500, fontSize: 40,
        margin: "4px 0 0", lineHeight: 1.1, color: km.ink,
      }}>
        {title}
      </h1>
      {subtitle && (
        <p style={{ fontSize: 14, color: km.muted, marginTop: 8, lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
    </header>
  )
}
