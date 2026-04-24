"use client"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { LogoFenetreRond, LogoFenetreArche } from "../../components/LogosFenetrePreview"

/**
 * Preview de 2 variantes de logo en forme de "fenêtre".
 * Paul : "Création d'un logo en forme de fenêtre, deux variantes à proposer :
 *   - rond avec 1 ligne verticale + 1 ligne horizontale plus grande,
 *   - demi-cercle en haut + carré en dessous, avec 3 traits
 *     (2 horizontaux, 1 vertical)."
 *
 * Les composants sont dans components/LogosFenetrePreview.tsx car Next.js
 * n'autorise pas les exports nommés depuis un page.tsx.
 */

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
        <p style={{ fontSize: 14, color: "#8a8477", marginTop: 6, marginBottom: 36, lineHeight: 1.6 }}>
          Deux variantes à comparer. Toutes les deux utilisent le dégradé orange→rouge de la marque pour cohérence
          avec le A actuel + les bandes emails. Choisis celle qui te plaît, je la plug partout (navbar + footer + emails + favicon).
        </p>

        {/* Comparaison grande taille sur fond clair + fond noir */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginBottom: 40 }}>

          {/* Variante A */}
          <div style={{ background: "white", borderRadius: 24, padding: 32, border: "1px solid #F7F4EF" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, marginBottom: 6 }}>Variante A — Rond (hublot)</h2>
            <p style={{ fontSize: 13, color: "#8a8477", margin: 0, marginBottom: 22 }}>Cercle avec croix interne (vertical court + horizontal long).</p>

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
          <div style={{ background: "white", borderRadius: 24, padding: 32, border: "1px solid #F7F4EF" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, marginBottom: 6 }}>Variante B — Arche (fenêtre classique)</h2>
            <p style={{ fontSize: 13, color: "#8a8477", margin: 0, marginBottom: 22 }}>Demi-cercle en haut + carré avec 3 traits (2 horizontaux, 1 vertical).</p>

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

        <div style={{ background: "white", borderRadius: 20, padding: 24, border: "1px solid #F7F4EF" }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0, marginBottom: 12 }}>Comment ça se propage si tu valides ?</h3>
          <ul style={{ fontSize: 13, color: "#111", lineHeight: 1.7, margin: 0, paddingLeft: 20 }}>
            <li>Remplacement de l&apos;icône dans <code style={{ background: "#F7F4EF", padding: "0 5px", borderRadius: 4, fontSize: 11 }}>app/components/Logo.tsx</code> (navbar, footer, auth, hero, PDF, emails)</li>
            <li>Update de <code style={{ background: "#F7F4EF", padding: "0 5px", borderRadius: 4, fontSize: 11 }}>lib/email/templates.ts</code> (logoSvg inline)</li>
            <li>Update de <code style={{ background: "#F7F4EF", padding: "0 5px", borderRadius: 4, fontSize: 11 }}>app/icon.svg</code> + favicon + PNG generés (192/256/512)</li>
            <li>Update du logo dans les PDFs bail/EDL via <code style={{ background: "#F7F4EF", padding: "0 5px", borderRadius: 4, fontSize: 11 }}>lib/brandPDF.ts</code></li>
          </ul>
          <p style={{ fontSize: 12, color: "#8a8477", marginTop: 14, margin: 0 }}>Dis-moi A ou B et je déploie partout.</p>
        </div>
      </div>
    </main>
  )
}
