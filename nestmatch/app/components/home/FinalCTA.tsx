"use client"
import Link from "next/link"
import FadeIn from "./FadeIn"

/**
 * CTA final pleine largeur, fond #111, padding vertical 120px.
 * Un seul bouton blanc, grand, radius 20px.
 * Pas de sous-texte parasite — une phrase, un bouton.
 */
export default function FinalCTA({ isMobile }: { isMobile: boolean }) {
  return (
    <section style={{
      background: "#111",
      color: "white",
      padding: isMobile ? "72px 24px" : "120px 48px",
    }}>
      <FadeIn>
        <div style={{
          maxWidth: 900,
          margin: "0 auto",
          textAlign: "center",
        }}>
          <h2 style={{
            fontSize: isMobile ? 32 : 52,
            fontWeight: 500,
            lineHeight: 1.1,
            letterSpacing: isMobile ? "-0.8px" : "-1.5px",
            color: "white",
            margin: 0,
            marginBottom: isMobile ? 32 : 44,
          }}>
            Prêt à trouver votre prochain chez vous ?
          </h2>
          <Link
            href="/auth?mode=inscription"
            style={{
              display: "inline-block",
              background: "white",
              color: "#111",
              padding: isMobile ? "16px 32px" : "20px 44px",
              borderRadius: 20,
              fontSize: isMobile ? 15 : 16,
              fontWeight: 600,
              letterSpacing: "0.3px",
              textDecoration: "none",
              transition: "transform 200ms ease, box-shadow 200ms ease",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "translateY(-1px)"
              e.currentTarget.style.boxShadow = "0 12px 32px rgba(255,255,255,0.15)"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "translateY(0)"
              e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)"
            }}
          >
            Créer mon compte
          </Link>
        </div>
      </FadeIn>
    </section>
  )
}
