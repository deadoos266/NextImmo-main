"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * ScrollLockReset — defense en profondeur contre les scroll-locks orphelins.
 *
 * Bug user (Paul 2026-04-27) : "quand je clique sur annonce sa marche et
 * d'autres fois ca marche tu aurais une explication ? genre je peux pas
 * scrolle du tout mais quand j'actualise la page a partir de ce moment ca
 * fonctionne".
 *
 * Cause : un modal/drawer/lightbox set `document.body.style.overflow =
 * 'hidden'` puis ne cleanup pas correctement avant la navigation Next.js.
 * Au changement de route, le composant unmount mais le cleanup React peut
 * ne pas s'executer en bon ordre, ou le composant est demonte avant que
 * l'effet ait eu le temps de cleanup. Le body reste `overflow: hidden`
 * sur la nouvelle page → scroll bloque jusqu'au hard-refresh.
 *
 * Fix : a chaque change de pathname, on force body + html overflow = ""
 * (reset au default CSS). Si un autre composant lock le scroll APRES la
 * nav (legitime), il re-applique son hidden — pas de regression. C'est
 * un nettoyage de fond opportuniste, pas un override permanent.
 *
 * Mounted une fois dans app/layout.tsx (cote client). No-op SSR.
 */
export default function ScrollLockReset() {
  const pathname = usePathname()
  useEffect(() => {
    // Reset body + html overflow + touchAction au change de route.
    // String vide pour revert au default CSS (et pas a une valeur set par
    // un autre composant qui aurait stock le prev).
    document.body.style.overflow = ""
    document.documentElement.style.overflow = ""
    // Pas de reset de touchAction : il est set globalement via app/globals.css
    // (`touch-action: pan-y` sur html/body) et les composants qui modifient
    // localement (lightbox, leaflet) ont leur propre cleanup.
  }, [pathname])
  return null
}
