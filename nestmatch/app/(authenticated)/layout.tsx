import TopChrome from "../components/TopChrome"
import Footer from "../components/Footer"
import MountedOnly from "../components/MountedOnly"
import BottomNavMobile from "../components/BottomNavMobile"

/**
 * V80.2 — chrome scoping pour les pages authentifiées.
 *
 * Apporte le chrome complet (TopChrome au top + BottomNavMobile en bas
 * sur mobile + Footer) aux pages sous app/(authenticated)/. Les pages
 * publiques (sous app/(public)/) ont leur propre layout avec un chrome
 * marketing simplifié — pas de TopChrome admin, pas de BottomNav.
 *
 * TopChrome regroupe BetaBanner + AdminBar + Navbar (V74.3). Chaque enfant
 * garde son sticky/zIndex propre (Navbar 10000, AdminBar 10001, Beta flow).
 *
 * BottomNavMobile :
 *  - Auto-hide quand thread messages mobile actif (event km:thread-mobile-open)
 *  - Auto-hide quand drawer burger ouvert
 *  - Auto-hide sur viewport desktop (CSS media query)
 *  - 5 tabs role-aware (locataire/proprio) — V73.9
 *  - Wrappé dans MountedOnly pour éviter hydration mismatch (dépend de
 *    useSession + useResponsive + useRole client-only)
 *
 * Footer : wrappé MountedOnly pour la même raison (dépendances client).
 */
export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopChrome />
      {children}
      <MountedOnly>
        <Footer />
      </MountedOnly>
      <MountedOnly>
        <BottomNavMobile />
      </MountedOnly>
    </>
  )
}
