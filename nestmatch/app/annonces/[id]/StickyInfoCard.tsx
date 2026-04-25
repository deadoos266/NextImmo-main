"use client"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * StickyInfoCard — R10.23 (rAF loop continu — fail-safe ultime)
 *
 * Approche brute-force : un requestAnimationFrame loop perpétuel qui tourne
 * tant que le composant est monté (60 fps idle, ~0.1 ms par frame). À chaque
 * frame :
 *
 *   1. Force `position: fixed` + `top: 80` + right + width sur l'aside
 *      (defensive contre toute mutation extérieure)
 *   2. Reset le transform pour mesurer la position naturelle
 *   3. Mesure rect.top via getBoundingClientRect (force reflow synchrone)
 *   4. Calcule la dérive (rect.top - 80)
 *   5. Si dérive ≠ 0, applique `transform: translateY(-drift)` qui compense
 *      mathématiquement, sans dépendre de l'ICB
 *
 * Pourquoi rAF loop continu et pas scroll listener ?
 *
 *   Les versions R10.20-R10.22 utilisaient un scroll listener attaché en
 *   useEffect. Symptôme rapporté : "ça bouge encore quand je scroll" même
 *   avec la stratégie transform-compensation. Hypothèse : le listener n'est
 *   pas attaché au bon moment (timing d'hydratation), ou un re-render le
 *   détache, ou un containing block dynamique apparaît après un certain
 *   délai. Le rAF loop résout TOUS ces cas en s'exécutant indépendamment
 *   du cycle React et en ré-appliquant la position chaque frame.
 *
 * Coût performance : ~0.1 ms par frame (1 getBoundingClientRect + ~3 style
 * writes), 60 fps = 6 ms/sec, soit 0.6 % CPU. Imperceptible.
 *
 * Le portal vers documentElement reste pour escape les filters/transforms
 * d'éventuels ancêtres dans <body>, mais le rAF loop fonctionnerait même
 * sans portal (ce qui en fait une vraie ceinture-bretelles).
 */

const NAV_OFFSET = 80
const MAX_CARD_WIDTH = 360
const PORTAL_TARGET_ID = "nm-fixed-portal-root"
const VERSION = "R10.23"

function getOrCreatePortalTarget(): HTMLElement {
  let el = document.getElementById(PORTAL_TARGET_ID)
  if (!el) {
    el = document.createElement("div")
    el.id = PORTAL_TARGET_ID
    document.documentElement.appendChild(el)
  }
  return el
}

function computeRightOffset(): number {
  if (typeof window === "undefined") return 24
  // Sur viewport ≥1280 : aligne sur container 1280 avec gutter 24. Sinon
  // colle à 12 px du bord droit.
  if (window.innerWidth >= 1280) {
    return Math.floor((window.innerWidth - 1280) / 2 + 24)
  }
  return 12
}

function computeCardWidth(): number {
  if (typeof window === "undefined") return MAX_CARD_WIDTH
  return Math.min(MAX_CARD_WIDTH, Math.floor(window.innerWidth * 0.92))
}

export default function StickyInfoCard({ children }: { children: React.ReactNode }) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [isDark, setIsDark] = useState<boolean>(false)
  const asideRef = useRef<HTMLElement | null>(null)

  // Init portal target + dark-mode observer (one-shot)
  useEffect(() => {
    setPortalTarget(getOrCreatePortalTarget())

    const checkDark = () => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark")
    }
    checkDark()
    const observer = new MutationObserver(checkDark)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => observer.disconnect()
  }, [])

  // Position-force loop continu via requestAnimationFrame.
  //
  // Indépendant de portalTarget : démarre dès le mount et tourne jusqu'à
  // unmount, peu importe l'état d'hydratation. Si asideRef.current est null
  // (ex. avant que le portal soit rendu), on attend juste le prochain
  // frame — coût quasi nul.
  //
  // À chaque frame, on FORCE la position de base (defensive contre toute
  // mutation externe) puis on compense toute dérive via transform.
  useEffect(() => {
    let frameId = 0
    let lastTransform = ""
    let frameCount = 0

    // Debug overlay : DOM direct (pas React state) pour zéro re-render à 60fps.
    // Affiche en temps réel : compteur de frames, rect.top mesuré, scrollY,
    // dérive, transform appliqué, position style. À retirer une fois le bug
    // résolu.
    const debugDiv = document.createElement("div")
    debugDiv.id = "nm-sticky-debug"
    debugDiv.style.cssText =
      "position:fixed;top:80px;left:8px;background:#FF4A1C;color:white;" +
      "font:11px monospace;padding:6px 10px;z-index:99999;white-space:pre;" +
      "border-radius:6px;line-height:1.4;pointer-events:none;max-width:380px"
    debugDiv.textContent = "DEBUG R10.23 — boot..."
    document.documentElement.appendChild(debugDiv)

    function tick() {
      frameCount++
      const el = asideRef.current
      if (el) {
        // 1. Force la position de base à chaque frame (defensive).
        if (el.style.position !== "fixed") el.style.position = "fixed"
        const wantedTop = `${NAV_OFFSET}px`
        if (el.style.top !== wantedTop) el.style.top = wantedTop
        const wantedRight = `${computeRightOffset()}px`
        if (el.style.right !== wantedRight) el.style.right = wantedRight
        const wantedWidth = `${computeCardWidth()}px`
        if (el.style.width !== wantedWidth) el.style.width = wantedWidth
        if (el.style.zIndex !== "9998") el.style.zIndex = "9998"

        // 2. Reset transform pour mesurer la position naturelle (sans
        //    notre compensation précédente). Le set vide reflow lors du
        //    prochain getBoundingClientRect.
        if (lastTransform) el.style.transform = ""

        // 3. Mesurer où l'élément se trouve réellement.
        const rect = el.getBoundingClientRect()
        const drift = Math.round(rect.top - NAV_OFFSET)

        // 4. Compenser la dérive via translateY. Mathématiquement non ambigu.
        const newTransform = drift !== 0 ? `translateY(${-drift}px)` : ""
        if (newTransform !== lastTransform) {
          el.style.transform = newTransform
          lastTransform = newTransform
        }

        // 5. Mise à jour overlay debug.
        const parent = el.parentElement
        const parentInfo = parent ? `${parent.tagName}#${parent.id || "?"}` : "null"
        debugDiv.textContent =
          `R10.23 frame=${frameCount}\n` +
          `rect.top=${rect.top.toFixed(1)} scrollY=${window.scrollY}\n` +
          `drift=${drift} transform=${newTransform || "none"}\n` +
          `pos=${el.style.position} top=${el.style.top}\n` +
          `parent=${parentInfo}`
      } else {
        debugDiv.textContent = `R10.23 frame=${frameCount} — asideRef null`
      }
      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => {
      if (frameId) cancelAnimationFrame(frameId)
      debugDiv.remove()
    }
  }, [])

  // SSR / pré-mount : flow normal le temps que le client boote.
  if (!portalTarget) {
    return (
      <div
        id="r-sticky-card-target"
        data-nm-sticky-version={VERSION}
        data-nm-sticky-mode="flow-ssr"
        style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}
      >
        {children}
      </div>
    )
  }

  const aside = (
    <aside
      ref={asideRef}
      id="r-sticky-card-target"
      data-nm-sticky-version={VERSION}
      data-nm-sticky-mode="portal"
      aria-label="Informations et actions du logement"
      style={{
        position: "fixed",
        top: NAV_OFFSET,
        right: computeRightOffset(),
        width: computeCardWidth(),
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        color: "#111",
        // Dark mode : ré-applique l'inversion perdue en sortant de <body>.
        filter: isDark ? "invert(0.92) hue-rotate(180deg)" : undefined,
        // Pas de maxHeight / overflow (règle user : pas de scroll dans le
        // scroll). Si les cards dépassent le viewport, cutoff bas assumé.
      }}
    >
      {children}
    </aside>
  )

  return createPortal(aside, portalTarget)
}
