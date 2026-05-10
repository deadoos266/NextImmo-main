import TopChrome from "../components/TopChrome"
import Footer from "../components/Footer"
import MountedOnly from "../components/MountedOnly"
import BottomNavMobile from "../components/BottomNavMobile"

/**
 * V80.2 + V81.2 — chrome pour les pages publiques.
 *
 * TopChrome (Navbar auth-aware) + Footer + BottomNavMobile.
 *
 * BottomNavMobile inclus aussi sur public (V81.2 fix bug user "menu en bas
 * absent sur /annonces version tel"). Le composant lui-même hide si pas
 * authentifié (`if (!session?.user) return null` — V73.9), donc :
 *  - Visiteur anonyme sur /annonces → pas de BottomNav (clean public look)
 *  - User logged sur /annonces → BottomNav visible (cohérent avec sa
 *    navigation dans le reste de l'app)
 *
 * Évolution future possible (V82+) : si besoin d'un vrai header marketing
 * dédié (full-bleed hero, pas de search bar, etc.), créer un
 * <PublicTopChrome /> distinct ici.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
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
