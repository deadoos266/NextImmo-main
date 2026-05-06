"use client"
import BetaBanner from "./BetaBanner"
import AdminBar from "./AdminBar"
import Navbar from "./Navbar"
import MountedOnly from "./MountedOnly"

/**
 * V73.7 → V74.3 — wrapper coordinator pour les 3 éléments du top chrome
 * (BetaBanner + AdminBar + Navbar).
 *
 * Stratégie V74.3 (intégration effective dans layout.tsx) :
 *  - Wrapper sémantique <header> qui regroupe les 3 composants
 *  - PAS de position sticky sur le wrapper lui-même (les enfants gèrent
 *    leur propre sticky avec leurs zIndex respectifs : V73.7 a déjà
 *    bumpé AdminBar à 10001 pour passer au-dessus de Navbar 10000).
 *  - Migration future V75 : passer en sticky parent unique avec enfants
 *    relatifs (refacto Navbar pour ne plus auto-stickyer).
 *
 * Bénéfice immédiat de V74.3 :
 *  - 1 seul mount au lieu de 3 dans layout.tsx → meilleure lisibilité
 *  - Sémantique <header> proper pour l'a11y (rôle banner implicite)
 *  - Point d'extension unique pour ajouter d'autres éléments top
 *    (ex: future preview maintenance banner, alert ban user, etc.)
 */
export default function TopChrome() {
  return (
    <header role="banner">
      {/* BetaBanner — flag `NEXT_PUBLIC_BETA=true`. Self-hides sinon. */}
      <BetaBanner />

      {/* AdminBar — flag `is_admin`. Self-hides sinon. */}
      <AdminBar />

      {/* Navbar — wrappée dans MountedOnly pour éviter hydration mismatch
          (cf commentaire historique app/layout.tsx). Fallback réserve la
          hauteur 72px pour éviter le CLS au mount. */}
      <MountedOnly fallback={<div style={{ height: 72, background: "white", borderBottom: "1px solid #EAE6DF" }} aria-hidden />}>
        <Navbar />
      </MountedOnly>
    </header>
  )
}
