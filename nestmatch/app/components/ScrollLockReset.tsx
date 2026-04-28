"use client"

import { useEffect, useLayoutEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * ScrollLockReset — defense en profondeur contre les scroll-locks orphelins.
 *
 * Bug user (Paul 2026-04-27) : "quand je clique sur annonce sa marche et
 * d'autres fois ca marche tu aurais une explication ? genre je peux pas
 * scrolle du tout mais quand j'actualise la page a partir de ce moment ca
 * fonctionne".
 *
 * V5.1 (Paul 2026-04-28) — renforce le fix : nouveau bug user
 * "J'ai lancé la page /annonces/[id] et j'ai pas pu scroller". Cause :
 * une modale/sheet de la page precedente capture body.overflow="hidden"
 * comme `prev` puis le restaure → le lock survit a la navigation.
 *
 * Cause : un modal/drawer/lightbox set `document.body.style.overflow =
 * 'hidden'` puis ne cleanup pas correctement avant la navigation Next.js.
 * Au changement de route, le composant unmount mais le cleanup React peut
 * ne pas s'executer en bon ordre, ou le composant est demonte avant que
 * l'effet ait eu le temps de cleanup. Le body reste `overflow: hidden`
 * sur la nouvelle page → scroll bloque jusqu'au hard-refresh.
 *
 * Fix multi-couches :
 *  1. useLayoutEffect synchrone post-DOM-commit → reset avant la peinture
 *     (l'utilisateur ne voit jamais le lock orphelin).
 *  2. useEffect avec setTimeout(0) → safety net apres tous les autres
 *     useEffect des composants enfants (qui pourraient re-lock leur
 *     ancien prev value).
 *  3. pageshow event (bfcache iOS) → quand iOS restaure une page depuis
 *     le cache, l'evenement pageshow tire et on re-clear (sinon scroll
 *     reste lock apres back/forward).
 *
 * Si un autre composant lock le scroll APRES la nav (legitime, ex.
 * Modal qui s'ouvre par interaction user), il re-applique son hidden —
 * pas de regression. C'est un nettoyage de fond opportuniste, pas un
 * override permanent.
 *
 * Mounted une fois dans app/layout.tsx (cote client). No-op SSR.
 */
function clearScrollLock() {
  if (typeof document === "undefined") return
  document.body.style.overflow = ""
  document.documentElement.style.overflow = ""
}

export default function ScrollLockReset() {
  const pathname = usePathname()

  // Layer 1 — synchrone post-commit, avant la peinture.
  useLayoutEffect(() => {
    clearScrollLock()
  }, [pathname])

  // Layer 2 — apres tous les useEffect enfants (setTimeout 0 = next tick
  // de la queue micro/macro tasks, garanti apres les useEffect des
  // composants meme deeply nested).
  useEffect(() => {
    const t = setTimeout(clearScrollLock, 0)
    return () => clearTimeout(t)
  }, [pathname])

  // Layer 3 — bfcache restoration iOS Safari + Chrome mobile.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) clearScrollLock()
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])

  return null
}
