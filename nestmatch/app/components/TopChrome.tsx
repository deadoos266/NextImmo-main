"use client"
import BetaBanner from "./BetaBanner"
import AdminBar from "./AdminBar"
import Navbar from "./Navbar"
import MountedOnly from "./MountedOnly"
import { Z_INDEX } from "../../lib/zIndex"

/**
 * V73.7 — wrapper coordinator pour les 3 éléments du top chrome
 * (BetaBanner + AdminBar + Navbar).
 *
 * Avant V73 : les 3 composants étaient montés séparément dans
 * `app/layout.tsx`, chacun avec sa propre stratégie sticky/zIndex
 * non coordonnée :
 *   - BetaBanner : flow normal, scroll → disparaît
 *   - AdminBar : sticky top: 0 zIndex 1100 → MASQUÉE par la Navbar (10000)
 *     pendant le scroll
 *   - Navbar : sticky top: 0 zIndex 10000 → passe au-dessus de tout
 *
 * Conséquence : un admin qui scroll voyait l'AdminBar disparaître sous la
 * Navbar, perdant le toggle "voir en tant que locataire/proprio".
 *
 * V73.7 — TopChrome est un container unique sticky top: 0. Les 3 enfants
 * sont en flow normal à l'intérieur, donc empilés naturellement (Beta
 * en haut, Admin au milieu, Navbar en bas) sans se masquer.
 *
 * IMPORTANT — migration progressive :
 *   - Cette V73 : TopChrome est créé et exporté, mais le layout.tsx
 *     monte encore BetaBanner / AdminBar / Navbar séparément. Les
 *     constantes Z_INDEX sont prêtes pour la migration.
 *   - V74 : remplacer les 3 mounts dans layout.tsx par <TopChrome />,
 *     retirer les `position: sticky` / zIndex internes de chaque enfant,
 *     migrer les composants children pour utiliser `relative` au lieu
 *     de `sticky`.
 *
 * Pour cette session, je préfère NE PAS forcer la migration dans le
 * layout root (risque de régression visuelle pendant que le user vérifie
 * en live). Le composant est prêt, à brancher V74 après visu test.
 */
export default function TopChrome() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: Z_INDEX.navbar,
        // Container neutre : pas de background, ce sont les enfants qui
        // colorient leur ligne (BetaBanner = beige, AdminBar = noir,
        // Navbar = blanc).
        contain: "layout style",
      }}
    >
      {/* BetaBanner — flag `NEXT_PUBLIC_BETA=true`. Self-hides sinon. */}
      <BetaBanner />

      {/* AdminBar — flag `is_admin`. Self-hides sinon. */}
      <AdminBar />

      {/* Navbar — wrappée dans MountedOnly pour éviter hydration mismatch
          (cf commentaire app/layout.tsx). Fallback réserve la hauteur. */}
      <MountedOnly fallback={<div style={{ height: 72, background: "white", borderBottom: "1px solid #EAE6DF" }} aria-hidden />}>
        <Navbar />
      </MountedOnly>
    </header>
  )
}
