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
 * Home KeyMatch — design system bundle, "no lies mode" + premium.
 *
 * Séquence : Hero → MarqueeStrip → LiveFeed → HowItWorks → Testimonials
 *          → CitiesGrid → FinalCTA
 *
 * Données : useFeaturedListings() fetch les 8 annonces les plus récentes de
 * la DB (sans filtre statut, vraies annonces uniquement). Empty state
 * honnête si 0 résultat.
 *
 * Testimonials transformés en "Promesses KeyMatch" (3 promesses produit
 * vérifiables, pas de persona fake).
 *
 * Scope strict respecté : aucune modif hors app/page.tsx + app/components/home/*
 * + /public/{villes,hero,howitworks}/*. Accessibilité `prefers-reduced-motion`
 * respectée sur tous les auto-advance.
 */
export default function Home() {
  const { isMobile, isTablet } = useResponsive()
  const { listings, loading } = useFeaturedListings()

  return (
    <main style={{ fontFamily: "'DM Sans', sans-serif", color: "#111", background: "#F7F4EF" }}>
      <Hero listings={listings} isMobile={isMobile} isTablet={isTablet} />
      {listings.length > 0 && <MarqueeStrip listings={listings} />}
      <LiveFeed listings={listings} loading={loading} isMobile={isMobile} isTablet={isTablet} />
      <HowItWorks isMobile={isMobile} />
      <Testimonials isMobile={isMobile} />
      <CitiesGrid isMobile={isMobile} />
      <FinalCTA listings={listings} isMobile={isMobile} />
    </main>
  )
}
