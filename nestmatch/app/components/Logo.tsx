import Link from "next/link"
import { BRAND, type LogoVariant } from "../../lib/brand"

type Props = {
  variant?: LogoVariant
  /** Si false, pas de Link wrapper vers "/" (utile dans emails/auth pages déjà sur home). */
  asLink?: boolean
  /** Override couleur du texte à côté du logo (défaut #111). */
  color?: string
  /** Masquer le nom à côté de l'icône (icône seule). Défaut = selon variant. */
  hideText?: boolean
}

// Tailles de l'icône SVG + taille du texte à côté + gap entre les deux.
// Chaque variant règle son propre rendu visuel cohérent.
const SIZES: Record<LogoVariant, {
  iconSize: number
  fontSize: number
  weight: number
  letterSpacing: string
  gap: number
  showText: boolean
}> = {
  navbar:  { iconSize: 46, fontSize: 24, weight: 900, letterSpacing: "-0.5px", gap: 10, showText: true  },
  footer:  { iconSize: 36, fontSize: 19, weight: 800, letterSpacing: "-0.3px", gap: 10, showText: true  },
  auth:    { iconSize: 72, fontSize: 30, weight: 900, letterSpacing: "-0.8px", gap: 14, showText: true  },
  hero:    { iconSize: 96, fontSize: 44, weight: 900, letterSpacing: "-1.2px", gap: 18, showText: true  },
  compact: { iconSize: 40, fontSize: 16, weight: 800, letterSpacing: "-0.3px", gap: 8,  showText: false },
  email:   { iconSize: 48, fontSize: 22, weight: 800, letterSpacing: "-0.5px", gap: 12, showText: true  },
  pdf:     { iconSize: 32, fontSize: 17, weight: 800, letterSpacing: "-0.3px", gap: 10, showText: true  },
}

/**
 * Logo KeyMatch : icône SVG (public/logo-mark.svg) + nom optionnel.
 * Montable dans server ET client components (aucun hook).
 *
 * Pour remplacer le visuel : éditer /public/logo-mark.svg. Pour changer la
 * disposition/ordre (texte avant icône, etc.) : éditer ce composant.
 */
export default function Logo({ variant = "navbar", asLink = true, color, hideText }: Props) {
  const s = SIZES[variant]
  const showText = hideText === true ? false : (hideText === false ? true : s.showText)

  const content = (
    <span
      role="img"
      aria-label={BRAND.name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        lineHeight: 1,
        color: color || BRAND.colors.primary,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-mark.svg"
        alt=""
        width={s.iconSize}
        height={s.iconSize}
        style={{ display: "block", flexShrink: 0 }}
      />
      {showText && (
        <span style={{
          fontSize: s.fontSize,
          fontWeight: s.weight,
          letterSpacing: s.letterSpacing,
        }}>
          {BRAND.name}
        </span>
      )}
    </span>
  )
  if (!asLink) return content
  return <Link href="/" style={{ textDecoration: "none", display: "inline-block" }}>{content}</Link>
}
