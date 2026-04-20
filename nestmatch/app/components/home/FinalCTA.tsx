"use client"
import Link from "next/link"
import Image from "next/image"
import type { FeaturedListing } from "./useFeaturedListings"
import { useReducedMotion } from "./hooks"

/**
 * CTA final plein écran fond noir. Image d'une annonce en fond très atténué.
 * 2 CTAs : primaire "Commencer ma recherche" → /annonces
 *          secondaire "Je suis propriétaire" → /auth?mode=inscription
 * Button hover : translateY(-1px) + ombre (selon règle design system).
 */
export default function FinalCTA({
  listings,
  isMobile,
}: { listings: FeaturedListing[]; isMobile: boolean }) {
  const reduced = useReducedMotion()
  const bgPhoto = listings.find(l => l.photos.length > 0)?.photos[0]

  return (
    <section style={{
      position: "relative",
      background: "#111",
      color: "#fff",
      padding: isMobile ? "80px 24px" : "140px 32px",
      overflow: "hidden",
    }}>
      {/* Background image très atténuée (25 %) */}
      {bgPhoto && (
        <div style={{ position: "absolute", inset: 0, opacity: 0.25 }}>
          <Image src={bgPhoto} alt="" fill sizes="100vw" style={{ objectFit: "cover" }} />
        </div>
      )}

      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center", position: "relative" }}>
        <h2 style={{
          fontSize: isMobile ? 36 : 60,
          fontWeight: 500,
          lineHeight: 1.05,
          letterSpacing: isMobile ? "-1px" : "-1.8px",
          margin: 0,
          marginBottom: isMobile ? 28 : 40,
        }}>
          Trouvez votre prochain chez&nbsp;vous.
        </h2>
        <p style={{
          fontSize: isMobile ? 15 : 18,
          color: "rgba(255,255,255,0.7)",
          maxWidth: 520,
          margin: isMobile ? "0 auto 32px" : "0 auto 44px",
          lineHeight: 1.5,
        }}>
          Inscription gratuite. Dossier ALUR en 10 minutes. Candidature en un clic.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/annonces"
            style={{
              background: "#fff",
              color: "#111",
              padding: isMobile ? "14px 28px" : "18px 36px",
              borderRadius: 20,
              border: "none",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.3px",
              textDecoration: "none",
              display: "inline-block",
              transition: "transform 200ms ease, box-shadow 200ms ease",
            }}
            onMouseEnter={e => {
              if (reduced) return
              e.currentTarget.style.transform = "translateY(-1px)"
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(255,255,255,0.2)"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "translateY(0)"
              e.currentTarget.style.boxShadow = "none"
            }}
          >
            Commencer ma recherche
          </Link>
          <Link
            href="/auth?mode=inscription"
            style={{
              background: "transparent",
              color: "#fff",
              padding: isMobile ? "14px 22px" : "18px 28px",
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.3)",
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              textDecoration: "none",
              display: "inline-block",
              transition: "background 200ms ease, border-color 200ms ease",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(255,255,255,0.08)"
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent"
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"
            }}
          >
            Je suis propriétaire →
          </Link>
        </div>
      </div>
    </section>
  )
}
