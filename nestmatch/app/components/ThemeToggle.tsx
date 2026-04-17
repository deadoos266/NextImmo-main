"use client"
import { useEffect, useState } from "react"
import { type Theme, getStoredTheme, setStoredTheme, applyTheme } from "../../lib/theme"

/**
 * Sélecteur de thème : Clair / Sombre / Système.
 * Persiste dans localStorage via lib/theme.ts et met à jour
 * `<html data-theme="…">` en direct (sans rechargement).
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setTheme(getStoredTheme())
    setMounted(true)
  }, [])

  // Si l'utilisateur est en mode "system", on suit les changements OS en live
  useEffect(() => {
    if (!mounted || theme !== "system" || typeof window === "undefined") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyTheme("system")
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme, mounted])

  function choose(t: Theme) {
    setTheme(t)
    setStoredTheme(t)
  }

  const options: { value: Theme; label: string; hint: string }[] = [
    { value: "light", label: "Clair", hint: "Thème clair fixe" },
    { value: "dark", label: "Sombre", hint: "Thème sombre fixe" },
    { value: "system", label: "Système", hint: "Suit les réglages de votre appareil" },
  ]

  // SSR-safe : tant que non monté, on affiche neutre (pas de décalage)
  const current = mounted ? theme : "system"

  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Apparence</p>
      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
        Choisissez l'apparence qui vous convient le mieux.
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map(o => {
          const active = current === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => choose(o.value)}
              title={o.hint}
              aria-pressed={active}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                border: `1.5px solid ${active ? "#111" : "#e5e7eb"}`,
                background: active ? "#111" : "white",
                color: active ? "white" : "#111",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
