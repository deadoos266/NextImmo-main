"use client"
import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * Popover inline anchor-positioned — utilisé par FiltersBar pour les chips
 * rapides (Ville / Budget / Pièces). Click-outside + ESC ferment.
 *
 * Props :
 *   label    — texte du chip trigger (ex. « Ville »)
 *   value    — valeur active affichée à droite du label (ex. « Paris »)
 *   active   — bordure noire si true, #EAE6DF sinon
 *   width    — largeur du panneau ouvert, default 280
 *   children — contenu du panneau (rendu dans un wrapper scrollable)
 *
 * Z-index : 6100 (au-dessus de FiltersBar 6000, en-dessous de la Navbar 7000
 * et de FiltersModal 7500). Pas de transform sur le parent (carte Leaflet
 * ne doit pas hériter de stacking context cassé).
 */
export default function FilterPopover({
  label,
  value,
  active,
  width = 280,
  children,
  onClear,
}: {
  label: string
  value?: string | null
  active: boolean
  width?: number
  children: ReactNode
  onClear?: () => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // ESC pour fermer + retour focus au trigger
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(v => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "white",
          color: "#111",
          border: `1px solid ${active ? "#111" : "#EAE6DF"}`,
          borderRadius: 999,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: active ? 600 : 500,
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          transition: "border-color 0.15s, box-shadow 0.15s",
          boxShadow: open ? "0 0 0 3px rgba(17,17,17,0.08)" : "none",
        }}
      >
        <span>{label}</span>
        {value ? (
          <span style={{ color: "#666", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
            · {value}
          </span>
        ) : null}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginLeft: 2, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          {/* Click-outside overlay, capte le clic et ferme sans couvrir d'autres UIs */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 6090, background: "transparent" }}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label}
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              width,
              background: "white",
              border: "1px solid #EAE6DF",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 12px 32px rgba(0,0,0,0.10)",
              zIndex: 6100,
              animation: "km-popover-in 180ms ease-out",
            }}
          >
            <style>{`
              @keyframes km-popover-in {
                from { opacity: 0; transform: translateY(-4px) }
                to   { opacity: 1; transform: translateY(0) }
              }
            `}</style>
            {children}
            {onClear && active && (
              <button
                type="button"
                onClick={() => { onClear(); setOpen(false) }}
                style={{
                  marginTop: 12,
                  width: "100%",
                  background: "transparent",
                  color: "#6B6B6B",
                  border: "none",
                  borderTop: "1px solid #EAE6DF",
                  padding: "10px 0 0",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textDecoration: "underline",
                }}
              >
                Effacer
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
