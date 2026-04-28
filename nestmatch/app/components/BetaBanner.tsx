"use client"
import { useEffect, useRef, useState } from "react"

/**
 * Bannière jaune en haut du site indiquant qu'on est en phase de test.
 * Visible quand NEXT_PUBLIC_BETA=true. Dismiss local via localStorage
 * (réapparaît sur un autre device/navigateur).
 *
 * V4.6 (Paul 2026-04-28) — auto-hide on scroll mobile :
 *   scroll down → translate -100% (hide), scroll up → translate 0 (reveal).
 *   Comportement Twitter/Mail iOS, mobile uniquement (desktop = fixe).
 */
export default function BetaBanner() {
  const [visible, setVisible] = useState(false)
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)
  const isMobileRef = useRef(false)

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_BETA !== "true") return
    try {
      const dismissed = localStorage.getItem("keymatch_beta_dismissed_v1")
      if (!dismissed) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  // V4.6 — auto-hide on scroll (mobile only)
  useEffect(() => {
    if (!visible || typeof window === "undefined") return
    const mq = window.matchMedia("(max-width: 767px)")
    const updateMobile = () => { isMobileRef.current = mq.matches; if (!mq.matches) setHidden(false) }
    updateMobile()
    mq.addEventListener("change", updateMobile)

    function onScroll() {
      if (!isMobileRef.current) return
      const y = window.scrollY
      const dy = y - lastY.current
      // Direction down past 30px → hide. Up by any amount → reveal.
      if (dy > 4 && y > 30) setHidden(true)
      else if (dy < -4) setHidden(false)
      lastY.current = y
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      mq.removeEventListener("change", updateMobile)
    }
  }, [visible])

  if (!visible) return null

  function dismiss() {
    try { localStorage.setItem("keymatch_beta_dismissed_v1", "1") } catch { /* ignore */ }
    setVisible(false)
  }

  return (
    <div
      role="status"
      style={{
        background: "#FBF6EA",
        borderBottom: "1px solid #EADFC6",
        color: "#a16207",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        flexWrap: "wrap",
        lineHeight: 1.5,
        // V4.6 — translate-Y mobile auto-hide
        transform: hidden ? "translateY(-110%)" : "translateY(0)",
        transition: "transform 220ms ease",
        willChange: "transform",
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "1.4px", background: "#EADFC6", padding: "3px 10px", borderRadius: 999 }}>Bêta</span>
      <span>
        Le site est en phase de test actif — certaines fonctionnalités peuvent évoluer. Lancement officiel à venir.
      </span>
      <button
        onClick={dismiss}
        aria-label="Fermer le bandeau bêta"
        style={{
          background: "transparent",
          border: "none",
          color: "#a16207",
          cursor: "pointer",
          fontSize: 16,
          padding: 0,
          lineHeight: 1,
          fontFamily: "inherit",
        }}
      >
        ×
      </button>
    </div>
  )
}
