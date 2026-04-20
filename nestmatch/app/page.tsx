"use client"
import { useResponsive } from "./hooks/useResponsive"
import { useFeaturedListings } from "./components/home/useFeaturedListings"
import Hero from "./components/home/Hero"
import MarqueeStrip from "./components/home/MarqueeStrip"
import LiveFeed from "./components/home/LiveFeed"
import HowItWorks from "./components/home/HowItWorks"
import Testimonials from "./components/home/Testimonials"
import CitiesGrid from "./components/home/CitiesGrid"
import FinalCTA from "./components/home/FinalCTA"

/**
 * Home KeyMatch — design system bundle (handoff 2026-04-20).
 *
 * Séquence : Hero → MarqueeStrip → LiveFeed → HowItWorks → Testimonials
 *          → CitiesGrid → FinalCTA
 *
 * Données : useFeaturedListings() fetch 8 dernières annonces disponibles
 * avec photos[] non vide. Fallback gradient si < 8. Utilisé dans Hero
 * (ken-burns + FloatingPill), MarqueeStrip, LiveFeed, HowItWorks (images
 * steps) et FinalCTA (image de fond).
 *
 * Scope strict respecté : aucune modif hors app/page.tsx + app/components/home/*.
 * Aucune API route touchée. SEO metadata dans app/layout.tsx intact.
 * Accessibilité : `prefers-reduced-motion` respecté sur tous les auto-advance
 * (typewriter, ken-burns, marquee, HowItWorks, Testimonials, card hover).
 */
export default function Home() {
  const { isMobile, isTablet } = useResponsive()
  const { listings, loading } = useFeaturedListings()

  return (
    <main style={{ fontFamily: "'DM Sans', sans-serif", color: "#111", background: "#F7F4EF" }}>
      <Hero listings={listings} isMobile={isMobile} isTablet={isTablet} />
      <MarqueeStrip listings={listings} />
      <LiveFeed listings={listings} loading={loading} isMobile={isMobile} isTablet={isTablet} />
      <HowItWorks listings={listings} isMobile={isMobile} />
      <Testimonials isMobile={isMobile} />
      <CitiesGrid isMobile={isMobile} />
      <FinalCTA listings={listings} isMobile={isMobile} />
    </main>
  )
}
