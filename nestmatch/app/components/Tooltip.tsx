"use client"
import { useState, useRef, useEffect } from "react"

/**
 * Petit point d'interrogation qui affiche une bulle explicative au hover/focus.
 * Usage : <Tooltip text="DPE = Diagnostic de Performance Énergétique..." />
 * Placé à côté d'un label pour clarifier une notion complexe.
 */
export default function Tooltip({ text, size = 14 }: { text: string; size?: number }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  // "above" = tooltip affiché au-dessus du ? (default si assez d'espace en haut)
  // "below" = tooltip affiché en-dessous (si proche du haut de la fenêtre)
  const [placement, setPlacement] = useState<"above" | "below">("above")

  useEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    // Si proche du haut (moins de 140px), afficher en-dessous
    setPlacement(rect.top < 140 ? "below" : "above")
  }, [open])

  const offset = size + 10

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", verticalAlign: "middle", marginLeft: 6 }}>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={e => { e.preventDefault(); setOpen(v => !v) }}
        aria-label="Plus d'informations"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: open ? "#111" : "#e5e7eb",
          color: open ? "white" : "#6b7280",
          border: "none",
          cursor: "help",
          fontSize: size * 0.7,
          fontWeight: 700,
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          transition: "background 0.15s, color 0.15s",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            // Si "above" : tooltip positionné via bottom (décale le tooltip VERS LE HAUT depuis le button)
            // Si "below" : tooltip positionné via top (décale VERS LE BAS)
            ...(placement === "above"
              ? { bottom: offset }
              : { top: offset }),
            background: "#111",
            color: "white",
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1.5,
            width: 240,
            maxWidth: "80vw",
            zIndex: 2000,
            boxShadow: "0 6px 24px rgba(0,0,0,0.2)",
            pointerEvents: "none",
            whiteSpace: "normal",
            textAlign: "left",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {text}
          {/* Flèche pointant vers le ? :
              - si tooltip au-dessus : flèche en bas du tooltip (pointe vers le bas)
              - si tooltip en-dessous : flèche en haut du tooltip (pointe vers le haut) */}
          <span
            style={{
              position: "absolute",
              left: "50%",
              marginLeft: -5,
              width: 10,
              height: 10,
              background: "#111",
              transform: "rotate(45deg)",
              ...(placement === "above"
                ? { bottom: -4 }
                : { top: -4 }),
            }}
          />
        </span>
      )}
    </span>
  )
}
