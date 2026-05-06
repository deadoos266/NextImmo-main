"use client"
import { useState } from "react"
import { useResponsive } from "../../hooks/useResponsive"
import Hero from "./Hero"
import ProfilsMarquee from "./ProfilsMarquee"
import LiveFeed from "./LiveFeed"
import HowItWorks from "./HowItWorks"
import MessagerieSection from "./MessagerieSection"
import Testimonials from "./Testimonials"
import CitiesGrid from "./CitiesGrid"
import FinalCTA from "./FinalCTA"
import type { FeaturedListing } from "./useFeaturedListings"

/**
 * HomeClient — extrait du Home() précédent, désormais nourri par les
 * annonces server-fetched dans `app/page.tsx` (RSC).
 *
 * Responsive et interactivité (Hero typewriter, LiveFeed carrousel, etc.)
 * restent côté client. Le seul changement vs V70 est l'absence de
 * `useFeaturedListings()` : les listings arrivent en props, prêts dès le
 * premier render SSR (pas d'effet de chargement vide à l'hydration).
 */
export default function HomeClient({ initialListings }: { initialListings: FeaturedListing[] }) {
  const { isMobile, isTablet } = useResponsive()
  const [listings] = useState<FeaturedListing[]>(initialListings)
  const loading = false

  return (
    <main style={{ fontFamily: "'DM Sans', sans-serif", color: "#111", background: "#F7F4EF" }}>
      <Hero listings={listings} isMobile={isMobile} isTablet={isTablet} />
      <ProfilsMarquee />
      <LiveFeed listings={listings} loading={loading} isMobile={isMobile} isTablet={isTablet} />
      <HowItWorks isMobile={isMobile} />
      <MessagerieSection isMobile={isMobile} isTablet={isTablet} />
      <Testimonials isMobile={isMobile} />
      <CitiesGrid isMobile={isMobile} />
      <FinalCTA listings={listings} isMobile={isMobile} />
    </main>
  )
}
