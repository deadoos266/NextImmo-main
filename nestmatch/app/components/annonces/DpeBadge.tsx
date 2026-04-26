"use client"
import { useState, useRef, useEffect } from "react"
import { dpeColorFor, dpeDescription, dpeEnergyCost } from "../../../lib/dpeColors"

/**
 * Chip DPE colorée + tooltip pédagogique au hover/focus/click.
 *
 * Affichage : carré aux couleurs ADEME avec la lettre. Au hover (desktop)
 * ou click (mobile/clavier), affiche une bulle explicative :
 *   - bornes kWh/m²/an officielles
 *   - qualificatif
 *   - estimation grossière chauffage si surface fournie
 *
 * Volontairement informatif, pas un simulateur précis. Aide les
 * utilisateurs qui ne maîtrisent pas la nomenclature DPE à comprendre
 * en un clic ce que veut dire "DPE C" ou "DPE F".
 */
export default function DpeBadge({
  letter,
  surfaceM2 = null,
  size = 18,
}: {
  letter: string | null | undefined
  surfaceM2?: number | null
  size?: number
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [placement, setPlacement] = useState<"above" | "below">("above")

  useEffect(() => {
    if (!open || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    setPlacement(rect.top < 200 ? "below" : "above")
  }, [open])

  if (!letter) return null
  const L = letter.toUpperCase()
  const desc = dpeDescription(L)
  const cost = dpeEnergyCost(L, surfaceM2)
  const offset = size + 12

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        aria-label={`Classe énergie ${L} — cliquez pour plus d'informations`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v) }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: dpeColorFor(L),
          color: "#fff",
          fontSize: Math.round(size * 0.56),
          fontWeight: 700,
          width: size,
          height: size,
          borderRadius: 4,
          border: "none",
          cursor: "help",
          padding: 0,
          fontFamily: "inherit",
          letterSpacing: 0,
          lineHeight: 1,
          flexShrink: 0,
          transition: "transform 120ms ease",
          transform: open ? "scale(1.08)" : "scale(1)",
        }}
      >
        {L}
      </button>
      {open && desc && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            ...(placement === "above" ? { bottom: offset } : { top: offset }),
            background: "#111",
            color: "#fff",
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1.5,
            width: 260,
            maxWidth: "80vw",
            zIndex: 2000,
            boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
            pointerEvents: "none",
            whiteSpace: "normal",
            textAlign: "left",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <strong style={{ fontWeight: 700, color: dpeColorFor(L), display: "block", marginBottom: 4 }}>
            DPE {L}
          </strong>
          {desc}
          {cost !== null && (
            <span style={{ display: "block", marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.75)" }}>
              ≈ {cost.toLocaleString("fr-FR")} €/an de chauffage estimé pour {surfaceM2} m² (indicatif).
            </span>
          )}
          <span
            style={{
              position: "absolute",
              left: "50%",
              marginLeft: -5,
              width: 10,
              height: 10,
              background: "#111",
              transform: "rotate(45deg)",
              ...(placement === "above" ? { bottom: -4 } : { top: -4 }),
            }}
          />
        </span>
      )}
    </span>
  )
}
