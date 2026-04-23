"use client"
import { useEffect, ReactNode } from "react"

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** Eyebrow optionnel (uppercase letterSpacing 1.4px) affichée au-dessus du titre. */
  eyebrow?: string
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
 * Modale réutilisable — calque handoff modals.jsx (editorial) :
 * overlay noir blur 8px, card radius 24 + hairline beige, titre Fraunces italic,
 * footer fond beige F7F4EF, header/footer hairline #EAE6DF.
 *
 * À utiliser pour flux secondaires (sélection équipements, aide contextuelle,
 * confirmation) plutôt que navigation vers une page dédiée.
 */
export default function Modal({
  open,
  onClose,
  title,
  eyebrow,
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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');
        @keyframes nm-modal-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes nm-modal-rise { from { opacity: 0; transform: translate(-50%, -48%) } to { opacity: 1; transform: translate(-50%, -50%) } }
      `}</style>
      <div
        onClick={strict ? undefined : onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(17,17,17,0.55)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 9000,
          animation: "nm-modal-fade 0.18s ease-out",
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
          background: "#fff",
          border: "1px solid #EAE6DF",
          borderRadius: 24,
          width: `min(${maxWidth}px, 94vw)`,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 64px rgba(17,17,17,0.22)",
          zIndex: 9001,
          fontFamily: "'DM Sans', sans-serif",
          overflow: "hidden",
          animation: "nm-modal-rise 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* Header — hairline beige */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "22px 28px 18px",
            borderBottom: "1px solid #EAE6DF",
            flexShrink: 0,
            gap: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {eyebrow && (
              <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 6px" }}>
                {eyebrow}
              </p>
            )}
            <h2
              id="nm-modal-title"
              style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: 22,
                lineHeight: 1.2,
                letterSpacing: "-0.3px",
                margin: 0,
                color: "#111",
              }}
            >
              {title}
            </h2>
          </div>
          {showClose && (
            <button
              onClick={onClose}
              aria-label="Fermer"
              style={{
                background: "#F7F4EF",
                border: "1px solid #EAE6DF",
                width: 32,
                height: 32,
                borderRadius: "50%",
                color: "#111",
                cursor: "pointer",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "inherit",
                flexShrink: 0,
                transition: "background 200ms ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#EAE6DF" }}
              onMouseLeave={e => { e.currentTarget.style.background = "#F7F4EF" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Body scrollable */}
        <div
          style={{
            padding: "22px 28px",
            overflowY: "auto",
            flex: 1,
            fontSize: 14,
            lineHeight: 1.6,
            color: "#111",
          }}
        >
          {children}
        </div>

        {/* Footer optionnel — fond beige, hairline */}
        {footer && (
          <div
            style={{
              padding: "16px 28px",
              borderTop: "1px solid #EAE6DF",
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              flexShrink: 0,
              background: "#F7F4EF",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </>
  )
}
