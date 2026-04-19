"use client"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

type Props = {
  message: string
  onUndo: () => void
  delayMs?: number
}

/**
 * Toast fixe en bas d'écran avec un bouton "Annuler" visible.
 * Barre de progression visuelle qui décrémente jusqu'à l'expiration.
 *
 * Le timer logique (celui qui déclenche le vrai delete) est dans `useUndo` ;
 * ce composant se contente d'afficher le compte à rebours. Quand le pending
 * disparaît côté parent, le composant démonte → toast disparu.
 */
export default function UndoToast({ message, onUndo, delayMs = 5000 }: Props) {
  const [mounted, setMounted] = useState(false)
  const [remaining, setRemaining] = useState(delayMs)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => {
      const left = Math.max(0, delayMs - (Date.now() - start))
      setRemaining(left)
      if (left === 0) clearInterval(id)
    }, 100)
    return () => clearInterval(id)
  }, [delayMs])

  if (!mounted) return null

  const pct = (remaining / delayMs) * 100

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "#111",
        color: "white",
        padding: "14px 18px 14px 18px",
        borderRadius: 14,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        minWidth: 280,
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontFamily: "'DM Sans', sans-serif",
        overflow: "hidden",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{message}</span>
      <button
        type="button"
        onClick={onUndo}
        style={{
          background: "white",
          color: "#111",
          border: "none",
          borderRadius: 999,
          padding: "6px 14px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Annuler
      </button>
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 2,
          background: "rgba(255,255,255,0.55)",
          width: `${pct}%`,
          transition: "width 100ms linear",
        }}
      />
    </div>,
    document.body,
  )
}
