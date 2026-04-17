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
  const [pos, setPos] = useState<"top" | "bottom">("top")

  useEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    // Si proche du haut de la fenêtre, afficher en bas
    setPos(rect.top < 120 ? "bottom" : "top")
  }, [open])

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
        }}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            left: size / 2,
            transform: "translateX(-50%)",
            [pos]: size + 8,
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
          } as React.CSSProperties}
        >
          {text}
          {/* Petite flèche */}
          <span
            style={{
              position: "absolute",
              [pos === "top" ? "bottom" : "top"]: -5,
              left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              width: 10,
              height: 10,
              background: "#111",
            } as React.CSSProperties}
          />
        </span>
      )}
    </span>
  )
}
