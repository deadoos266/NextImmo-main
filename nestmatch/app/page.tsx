"use client"
import { useResponsive } from "./hooks/useResponsive"
import { useFeaturedListings } from "./components/home/useFeaturedListings"
import Hero from "./components/home/Hero"
import ProfilsMarquee from "./components/home/ProfilsMarquee"
import LiveFeed from "./components/home/LiveFeed"
import HowItWorks from "./components/home/HowItWorks"
import MessagerieSection from "./components/home/MessagerieSection"
import Testimonials from "./components/home/Testimonials"
import CitiesGrid from "./components/home/CitiesGrid"
import FinalCTA from "./components/home/FinalCTA"

/**
 * Home KeyMatch — design system bundle, no-lies mode + premium.
 *
 * Séquence :
 *   Hero → ProfilsMarquee → LiveFeed → HowItWorks → MessagerieSection
 *   → Testimonials → CitiesGrid → FinalCTA
 *
 * Données :
 *   useFeaturedListings() fetche les annonces disponibles (whitelist
 *   statut = 'disponible' OR NULL) avec photos. Empty state honnête
 *   "Bientôt en ligne" + CTA /dossier si 0 résultat.
 *
 * Contenu fictif balisé :
 *   - ProfilsMarquee : 12 profils locataires fictifs (illustration diversité)
 *   - Testimonials : 3 témoignages fictifs avec eyebrow "EXEMPLE D'UTILISATION"
 *
 * Scope strict : app/page.tsx + app/components/home/* + /public/. SEO/metadata
 * dans app/layout.tsx intact. Accessibilité prefers-reduced-motion respectée
 * sur tous les auto-advance.
 */
export default function Home() {
  const { isMobile, isTablet } = useResponsive()
  const { listings, loading } = useFeaturedListings()

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
