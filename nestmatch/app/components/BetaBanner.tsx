"use client"
import { useEffect, useState } from "react"
import { useAutoHideOnScroll } from "../hooks/useAutoHideOnScroll"

/**
 * Bannière jaune en haut du site indiquant qu'on est en phase de test.
 * Visible quand NEXT_PUBLIC_BETA=true. Dismiss local via localStorage
 * (réapparaît sur un autre device/navigateur).
 *
 * V4.6 + V5.2 (Paul 2026-04-28) — auto-hide on scroll mobile :
 *   scroll down → translate -110% (hide), scroll up → translate 0 (reveal).
 *   Logique extraite dans hooks/useAutoHideOnScroll pour reuse.
 */
export default function BetaBanner() {
  const [visible, setVisible] = useState(false)
  const hidden = useAutoHideOnScroll({ enabled: visible })

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_BETA !== "true") return
    try {
      const dismissed = localStorage.getItem("keymatch_beta_dismissed_v1")
      if (!dismissed) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

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
