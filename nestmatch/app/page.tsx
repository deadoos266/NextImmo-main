"use client"
import { useResponsive } from "./hooks/useResponsive"
import Hero from "./components/home/Hero"
import TrustBar from "./components/home/TrustBar"
import HowItWorks from "./components/home/HowItWorks"
import FeaturedListings from "./components/home/FeaturedListings"
import EditorialSection from "./components/home/EditorialSection"
import FinalCTA from "./components/home/FinalCTA"

/**
 * Home Keymatch-immo — refonte éditoriale 2026-04-20 (Direction A validée).
 *
 * Séquence : Hero → TrustBar → HowItWorks → FeaturedListings → EditorialSection → FinalCTA.
 *
 * Règles de non-régression respectées :
 * - Aucune logique métier touchée (API routes, auth, Supabase, matching, etc.)
 * - Aucun fichier renommé/déplacé hors scope
 * - Modifications scope : app/page.tsx + app/components/home/* + Footer style only
 * - Palette stricte #F7F4EF / #111 / #FFF / #EAE6DF
 * - Inline styles uniquement, zéro emoji, border-radius 20px
 * - Mobile-first testé <768px
 * - prefers-reduced-motion respecté (FadeIn.tsx)
 */
export default function Home() {
  const { isMobile, isTablet } = useResponsive()
  return (
    <main style={{
      background: "#F7F4EF",
      fontFamily: "'DM Sans', sans-serif",
      color: "#111",
    }}>
      <Hero isMobile={isMobile} isTablet={isTablet} />
      <TrustBar isMobile={isMobile} />
      <HowItWorks isMobile={isMobile} />
      <FeaturedListings isMobile={isMobile} isTablet={isTablet} />
      <EditorialSection isMobile={isMobile} isTablet={isTablet} />
      <FinalCTA isMobile={isMobile} />
    </main>
  )
}
