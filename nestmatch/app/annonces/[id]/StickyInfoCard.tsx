"use client"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

/**
 * StickyInfoCard — R10.19 (portal bulletproof hors <body>)
 *
 * PROBLÈME IDENTIFIÉ
 * ------------------
 * `position: fixed` était cassé par un ancêtre qui crée un containing block.
 * Spec CSS : tout ancêtre avec `filter`, `transform`, `will-change`,
 * `perspective` ou `contain` fait que `position: fixed` se comporte comme
 * `position: absolute` relatif à cet ancêtre, au lieu du viewport.
 *
 * Cas dans NestMatch : `globals.css` applique `html[data-theme="dark"] body
 * { filter: invert(...) }` pour le mode sombre. En dark mode, body devient
 * containing block → le widget « fixed » scrollait avec le body.
 *
 * SOLUTION
 * --------
 * React Portal vers un `<div id="nm-fixed-portal-root">` injecté comme
 * enfant direct de `<html>` (hors de `<body>`). Aucun ancêtre entre l'aside
 * et le viewport → `position: fixed` est honoré par le navigateur
 * indépendamment des transforms/filters appliqués au reste du DOM.
 *
 * En dark mode, on ré-applique manuellement le filter d'inversion sur
 * l'aside elle-même (pour rester visuellement cohérent avec la page).
 * Le filter sur l'aside crée un containing block pour ses DESCENDANTS
 * fixed uniquement — ça ne casse PAS le fixed de l'aside elle-même.
 *
 * BEHAVIOR
 * --------
 * Desktop (≥1024 px) : portal + position: fixed top:80 right:gutter.
 * Mobile (<1024 px) : pas de portal, flow normal dans la sidebar wrapper.
 * SSR / avant mount : fallback flow normal (pas de portal côté serveur).
 */

const NAV_OFFSET = 80
const CARD_WIDTH = 360
const PORTAL_TARGET_ID = "nm-fixed-portal-root"

function getOrCreatePortalTarget(): HTMLElement {
  let el = document.getElementById(PORTAL_TARGET_ID)
  if (!el) {
    el = document.createElement("div")
    el.id = PORTAL_TARGET_ID
    // Enfant direct de <html>, hors de <body> → aucun filter/transform
    // parent ne peut casser le position:fixed des descendants.
    document.documentElement.appendChild(el)
  }
  return el
}

export default function StickyInfoCard({ children }: { children: React.ReactNode }) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [isDesktop, setIsDesktop] = useState<boolean>(true)
  const [isDark, setIsDark] = useState<boolean>(false)

  useEffect(() => {
    setPortalTarget(getOrCreatePortalTarget())

    const mql = window.matchMedia("(min-width: 1024px)")
    const updateDesktop = () => setIsDesktop(mql.matches)
    updateDesktop()
    mql.addEventListener("change", updateDesktop)

    // Synchronise le filter d'inversion quand le user toggle le thème.
    const checkDark = () => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark")
    }
    checkDark()
    const observer = new MutationObserver(checkDark)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })

    return () => {
      mql.removeEventListener("change", updateDesktop)
      observer.disconnect()
    }
  }, [])

  // Avant portal dispo ou mobile : flow normal. Garantit un HTML serveur ==
  // client (pas de hydration mismatch) puisque le portal est exclusivement
  // côté client.
  if (!portalTarget || !isDesktop) {
    return (
      <div
        id="r-sticky-card-target"
        style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}
      >
        {children}
      </div>
    )
  }

  const aside = (
    <aside
      id="r-sticky-card-target"
      aria-label="Informations et actions du logement"
      style={{
        position: "fixed",
        top: NAV_OFFSET,
        right: `max(24px, calc((100vw - 1280px) / 2 + 24px))`,
        width: CARD_WIDTH,
        height: "auto",
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        color: "#111",
        // Dark mode : on ré-applique l'inversion perdue en sortant de <body>.
        filter: isDark ? "invert(0.92) hue-rotate(180deg)" : undefined,
      }}
    >
      {children}
    </aside>
  )

  return createPortal(aside, portalTarget)
}
