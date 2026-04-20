"use client"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Preview de 2 variantes de logo en forme de "fenêtre".
 * Paul : "Création d'un logo en forme de fenêtre, deux variantes à proposer :
 *   - rond avec 1 ligne verticale + 1 ligne horizontale plus grande,
 *   - demi-cercle en haut + carré en dessous, avec 3 traits
 *     (2 horizontaux, 1 vertical)."
 *
 * Cette page permet a Paul de choisir. Page protegee admin.
 */

const GRADIENT_START = "#FF8A1E"
const GRADIENT_MID = "#FF4A1C"
const GRADIENT_END = "#E8271C"

// ─── Variante A : rond avec croix interne asymétrique ─────────────────────
function LogoFenetreRond({ size = 200, color = "currentColor" }: { size?: number; color?: string }) {
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
      {/* Cercle exterieur de la "fenêtre" */}
      <circle cx="100" cy="100" r="82" fill="none" stroke={color === "currentColor" ? `url(#${gradId})` : color} strokeWidth="10" />
      {/* Ligne verticale (courte, de haut en bas) */}
      <line x1="100" y1="30" x2="100" y2="170" stroke={color === "currentColor" ? `url(#${gradId})` : color} strokeWidth="8" strokeLinecap="round" />
      {/* Ligne horizontale (plus grande — elle traverse tout le cercle intérieur) */}
      <line x1="18" y1="100" x2="182" y2="100" stroke={color === "currentColor" ? `url(#${gradId})` : color} strokeWidth="10" strokeLinecap="round" />
    </svg>
  )
}

// ─── Variante B : demi-cercle haut + carré bas avec 3 traits ──────────────
function LogoFenetreArche({ size = 200, color = "currentColor" }: { size?: number; color?: string }) {
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
      {/* Contour fenêtre en arche : demi-cercle en haut + 2 côtés verticaux + bas */}
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
      {/* 2 traits horizontaux (séparations carreaux) */}
      <line x1="32" y1="100" x2="168" y2="100" stroke={color === "currentColor" ? `url(#${gradId})` : color} strokeWidth="8" strokeLinecap="round" />
      <line x1="32" y1="140" x2="168" y2="140" stroke={color === "currentColor" ? `url(#${gradId})` : color} strokeWidth="8" strokeLinecap="round" />
      {/* 1 trait vertical central (carreau du milieu) */}
      <line x1="100" y1="100" x2="100" y2="172" stroke={color === "currentColor" ? `url(#${gradId})` : color} strokeWidth="8" strokeLinecap="round" />
    </svg>
  )
}

export { LogoFenetreRond, LogoFenetreArche }

export default function LogosPreview() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "loading") return
    if (!session?.user?.isAdmin) router.replace("/")
  }, [status, session, router])

  if (!session?.user?.isAdmin) return null

  return (
    <main style={{ minHeight: "calc(100vh - 72px)", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "40px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>Logos fenêtre — propositions</h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 6, marginBottom: 36, lineHeight: 1.6 }}>
          Deux variantes à comparer. Toutes les deux utilisent le dégradé orange→rouge de la marque pour cohérence
          avec le A actuel + les bandes emails. Choisis celle qui te plaît, je la plug partout (navbar + footer + emails + favicon).
        </p>

        {/* Comparaison grande taille sur fond clair + fond noir */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginBottom: 40 }}>

          {/* Variante A */}
          <div style={{ background: "white", borderRadius: 24, padding: 32, border: "1px solid #f3f4f6" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, marginBottom: 6 }}>Variante A — Rond (hublot)</h2>
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0, marginBottom: 22 }}>Cercle avec croix interne (vertical court + horizontal long).</p>

            <div style={{ display: "flex", gap: 24, alignItems: "center", justifyContent: "center", padding: 32, background: "#F7F4EF", borderRadius: 16 }}>
              <LogoFenetreRond size={120} />
              <LogoFenetreRond size={72} />
              <LogoFenetreRond size={40} />
            </div>

            <div style={{ display: "flex", gap: 24, alignItems: "center", justifyContent: "center", padding: 32, background: "#111", borderRadius: 16, marginTop: 14 }}>
              <LogoFenetreRond size={120} color="white" />
              <LogoFenetreRond size={72} color="white" />
              <LogoFenetreRond size={40} color="white" />
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
              <LogoFenetreRond size={36} />
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px" }}>KeyMatch</span>
            </div>
          </div>

          {/* Variante B */}
          <div style={{ background: "white", borderRadius: 24, padding: 32, border: "1px solid #f3f4f6" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, marginBottom: 6 }}>Variante B — Arche (fenêtre classique)</h2>
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0, marginBottom: 22 }}>Demi-cercle en haut + carré avec 3 traits (2 horizontaux, 1 vertical).</p>

            <div style={{ display: "flex", gap: 24, alignItems: "center", justifyContent: "center", padding: 32, background: "#F7F4EF", borderRadius: 16 }}>
              <LogoFenetreArche size={120} />
              <LogoFenetreArche size={72} />
              <LogoFenetreArche size={40} />
            </div>

            <div style={{ display: "flex", gap: 24, alignItems: "center", justifyContent: "center", padding: 32, background: "#111", borderRadius: 16, marginTop: 14 }}>
              <LogoFenetreArche size={120} color="white" />
              <LogoFenetreArche size={72} color="white" />
              <LogoFenetreArche size={40} color="white" />
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
              <LogoFenetreArche size={36} />
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px" }}>KeyMatch</span>
            </div>
          </div>
        </div>

        <div style={{ background: "white", borderRadius: 20, padding: 24, border: "1px solid #f3f4f6" }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0, marginBottom: 12 }}>Comment ça se propage si tu valides ?</h3>
          <ul style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, margin: 0, paddingLeft: 20 }}>
            <li>Remplacement de l&apos;icône dans <code style={{ background: "#f3f4f6", padding: "0 5px", borderRadius: 4, fontSize: 11 }}>app/components/Logo.tsx</code> (navbar, footer, auth, hero, PDF, emails)</li>
            <li>Update de <code style={{ background: "#f3f4f6", padding: "0 5px", borderRadius: 4, fontSize: 11 }}>lib/email/templates.ts</code> (logoSvg inline)</li>
            <li>Update de <code style={{ background: "#f3f4f6", padding: "0 5px", borderRadius: 4, fontSize: 11 }}>app/icon.svg</code> + favicon + PNG generés (192/256/512)</li>
            <li>Update du logo dans les PDFs bail/EDL via <code style={{ background: "#f3f4f6", padding: "0 5px", borderRadius: 4, fontSize: 11 }}>lib/brandPDF.ts</code></li>
          </ul>
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 14, margin: 0 }}>Dis-moi A ou B et je déploie partout.</p>
        </div>
      </div>
    </main>
  )
}
