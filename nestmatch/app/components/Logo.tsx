import Link from "next/link"
import { BRAND, type LogoVariant } from "../../lib/brand"

type Props = {
  variant?: LogoVariant
  /** Si false, pas de Link wrapper vers "/" (utile dans emails/auth pages déjà sur home). */
  asLink?: boolean
  /** Override couleur (défaut #111 / BRAND.colors.primary). */
  color?: string
}

const SIZES: Record<LogoVariant, { fontSize: number; weight: number; letterSpacing: string }> = {
  navbar:  { fontSize: 22, weight: 900, letterSpacing: "-0.5px" },
  footer:  { fontSize: 18, weight: 800, letterSpacing: "-0.3px" },
  auth:    { fontSize: 28, weight: 900, letterSpacing: "-0.8px" },
  hero:    { fontSize: 42, weight: 900, letterSpacing: "-1.2px" },
  compact: { fontSize: 16, weight: 800, letterSpacing: "-0.3px" },
  email:   { fontSize: 22, weight: 800, letterSpacing: "-0.5px" },
  pdf:     { fontSize: 18, weight: 800, letterSpacing: "-0.3px" },
}

/**
 * Logo NestMatch. Placeholder texte stylé pour l'instant — quand le SVG
 * final arrive, swap dans CE SEUL fichier (lire instructions lib/brand.ts).
 *
 * N'utilise aucun hook : montable dans server OU client components.
 */
export default function Logo({ variant = "navbar", asLink = true, color }: Props) {
  const s = SIZES[variant]
  const content = (
    <span
      role="img"
      aria-label={BRAND.name}
      style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: s.fontSize,
        fontWeight: s.weight,
        letterSpacing: s.letterSpacing,
        color: color || BRAND.colors.primary,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {BRAND.name}
    </span>
  )
  if (!asLink) return content
  return <Link href="/" style={{ textDecoration: "none" }}>{content}</Link>
}
