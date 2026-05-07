import TopChrome from "../components/TopChrome"
import Footer from "../components/Footer"
import MountedOnly from "../components/MountedOnly"

/**
 * V80.2 — chrome scoping pour les pages publiques.
 *
 * Décision pragmatique : on conserve TopChrome (qui inclut Navbar) sur les
 * pages publiques aussi. La Navbar est déjà auth-aware (affiche
 * "Connexion / S'inscrire" si pas de session, menu user si connecté). Pas
 * besoin d'un header simplifié séparé qui dupliquerait la logique brand
 * KeyMatch + locale + responsive + theme switch.
 *
 * Différences avec (authenticated)/layout.tsx :
 *  - PAS de BottomNavMobile (pas de tabs auth sur les pages publiques)
 *  - Footer présent (déjà optimisé public/marketing)
 *  - AdminBar dans TopChrome auto-hide si pas admin (self-conditioned)
 *
 * Évolution future possible (V81+) : si besoin d'un vrai header marketing
 * dédié (full-bleed hero, pas de search bar, etc.), créer un
 * <PublicTopChrome /> distinct ici. Pour l'instant TopChrome polyvalent suffit.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopChrome />
      {children}
      <MountedOnly>
        <Footer />
      </MountedOnly>
    </>
  )
}
