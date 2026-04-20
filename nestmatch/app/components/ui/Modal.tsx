"use client"
import { useEffect, ReactNode } from "react"

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Largeur max en px — défaut 560 */
  maxWidth?: number
  /** Affiche le bouton × en haut à droite — défaut true */
  showClose?: boolean
  /** Footer personnalisé (ex : boutons d'action) */
  footer?: ReactNode
  /** Empêche la fermeture au clic backdrop — défaut false */
  strict?: boolean
}

/**
 * Modale réutilisable : backdrop sombre + card blanche centrée + ESC/clic-dehors pour fermer.
 *
 * Design cohérent avec le système KeyMatch (radius 20, DM Sans, #111).
 * À utiliser pour flux secondaires (sélection équipements, aide contextuelle, confirmation)
 * plutôt que navigation vers une page dédiée.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 560,
  showClose = true,
  footer,
  strict = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !strict) onClose()
    }
    window.addEventListener("keydown", handler)
    // Bloque le scroll du body
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", handler)
      document.body.style.overflow = prev
    }
  }, [open, strict, onClose])

  if (!open) return null

  return (
    <>
      <div
        onClick={strict ? undefined : onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 9000,
          animation: "nm-modal-fade 0.15s ease-out",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nm-modal-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "white",
          borderRadius: 20,
          width: `min(${maxWidth}px, 94vw)`,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
          zIndex: 9001,
          fontFamily: "'DM Sans', sans-serif",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid #f3f4f6",
            flexShrink: 0,
          }}
        >
          <h2
            id="nm-modal-title"
            style={{
              fontSize: 18,
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.2px",
              color: "#111",
            }}
          >
            {title}
          </h2>
          {showClose && (
            <button
              onClick={onClose}
              aria-label="Fermer"
              style={{
                background: "none",
                border: "none",
                fontSize: 22,
                color: "#6b7280",
                cursor: "pointer",
                padding: 4,
                lineHeight: 1,
                fontFamily: "inherit",
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Body scrollable */}
        <div
          style={{
            padding: "20px 24px",
            overflowY: "auto",
            flex: 1,
            fontSize: 14,
            lineHeight: 1.55,
            color: "#111",
          }}
        >
          {children}
        </div>

        {/* Footer optionnel */}
        {footer && (
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #f3f4f6",
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              flexShrink: 0,
              background: "#fafafa",
            }}
          >
            {footer}
          </div>
        )}
      </div>
      <style>{`@keyframes nm-modal-fade { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </>
  )
}
