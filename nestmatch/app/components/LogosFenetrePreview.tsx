/**
 * 2 variantes de logo "fenêtre" proposées à Paul.
 * Utilisées dans /admin/logos pour comparaison.
 *
 * Intentionnellement dans app/components/ (pas dans app/admin/)
 * car Next.js n'autorise pas les exports nommés depuis un page.tsx.
 */

const GRADIENT_START = "#FF8A1E"
const GRADIENT_MID = "#FF4A1C"
const GRADIENT_END = "#E8271C"

// ─── Variante A : rond avec croix interne asymétrique ─────────────────────
export function LogoFenetreRond({ size = 200, color = "currentColor" }: { size?: number; color?: string }) {
  const gradId = `keym-v1-${size}`
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 200 200" aria-label="Logo KeyMatch variante rond" role="img">
      <defs>
        <linearGradient id={gradId} x1="100" y1="10" x2="100" y2="190" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={GRADIENT_START} />
          <stop offset="55%" stopColor={GRADIENT_MID} />
          <stop offset="100%" stopColor={GRADIENT_END} />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="82" fill="none" stroke={color === "currentColor" ? `url(#${gradId})` : color} strokeWidth="10" />
      <line x1="100" y1="30" x2="100" y2="170" stroke={color === "currentColor" ? `url(#${gradId})` : color} strokeWidth="8" strokeLinecap="round" />
      <line x1="18" y1="100" x2="182" y2="100" stroke={color === "currentColor" ? `url(#${gradId})` : color} strokeWidth="10" strokeLinecap="round" />
    </svg>
  )
}

// ─── Variante B : demi-cercle haut + carré bas avec 3 traits ──────────────
export function LogoFenetreArche({ size = 200, color = "currentColor" }: { size?: number; color?: string }) {
  const gradId = `keym-v2-${size}`
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 200 200" aria-label="Logo KeyMatch variante arche" role="img">
      <defs>
        <linearGradient id={gradId} x1="100" y1="20" x2="100" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={GRADIENT_START} />
          <stop offset="55%" stopColor={GRADIENT_MID} />
          <stop offset="100%" stopColor={GRADIENT_END} />
        </linearGradient>
      </defs>
      <path
        d="M 32 100
           A 68 68 0 0 1 168 100
           L 168 172
           L 32 172
           Z"
        fill="none"
        stroke={color === "currentColor" ? `url(#${gradId})` : color}
        strokeWidth="10"
        strokeLinejoin="round"
      />
      <line x1="32" y1="100" x2="168" y2="100" stroke={color === "currentColor" ? `url(#${gradId})` : color} strokeWidth="8" strokeLinecap="round" />
      <line x1="32" y1="140" x2="168" y2="140" stroke={color === "currentColor" ? `url(#${gradId})` : color} strokeWidth="8" strokeLinecap="round" />
      <line x1="100" y1="100" x2="100" y2="172" stroke={color === "currentColor" ? `url(#${gradId})` : color} strokeWidth="8" strokeLinecap="round" />
    </svg>
  )
}
