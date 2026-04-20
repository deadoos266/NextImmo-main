"use client"
import { useEffect, useState } from "react"

/**
 * Bannière jaune en haut du site indiquant qu'on est en phase de test.
 * Visible quand NEXT_PUBLIC_BETA=true. Dismiss local via localStorage
 * (réapparaît sur un autre device/navigateur).
 */
export default function BetaBanner() {
  const [visible, setVisible] = useState(false)

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
        background: "#fef3c7",
        borderBottom: "1.5px solid #fde68a",
        color: "#92400e",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        flexWrap: "wrap",
        lineHeight: 1.5,
      }}
    >
      <span style={{ fontWeight: 700 }}>🚧 Bêta</span>
      <span>
        Le site est en phase de test actif — certaines fonctionnalités peuvent évoluer. Lancement officiel à venir.
      </span>
      <button
        onClick={dismiss}
        aria-label="Fermer le bandeau bêta"
        style={{
          background: "transparent",
          border: "none",
          color: "#92400e",
          cursor: "pointer",
          fontSize: 18,
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
