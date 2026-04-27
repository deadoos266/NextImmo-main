"use client"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { km } from "./km"

/**
 * Petit cercle "?" cliquable/hoverable qui ouvre un tooltip riche.
 *
 * Pattern : icône discrète à côté d'un label de form pour expliquer
 * pourquoi recommander une donnée (téléphone, KYC, etc.) sans alourdir
 * le formulaire principal.
 *
 * Différent de Tooltip.tsx (point d'interrogation rond, contenu compact
 * 240px) : HelpIcon supporte du contenu RICHE (titre + liste à puces +
 * footer), idéal pour expliquer des bénéfices multiples.
 *
 * Comportement :
 * - Desktop : hover ouvre, leave ferme (avec délai 100ms anti-clignotement)
 * - Mobile : tap ouvre, tap outside ferme, esc ferme
 * - role="button" + aria-describedby pour a11y
 */
export interface HelpIconProps {
  /** Contenu du tooltip — peut être texte simple ou JSX riche (listes, strong, etc.). */
  children: ReactNode
  /** Taille de l'icône (default 14). */
  size?: number
  /** aria-label pour l'icône elle-même (default "Plus d'informations"). */
  ariaLabel?: string
}

export default function HelpIcon({ children, size = 14, ariaLabel = "Plus d'informations" }: HelpIconProps) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<"above" | "below">("above")
  const btnRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipId = useId()

  useEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPlacement(rect.top < 200 ? "below" : "above")
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    const onClickOutside = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node)) {
        // Click hors du bouton ET hors du tooltip → ferme
        const tip = document.getElementById(tooltipId)
        if (tip && !tip.contains(e.target as Node)) setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onClickOutside)
    return () => {
      window.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onClickOutside)
    }
  }, [open, tooltipId])

  const offset = size + 12

  function openNow() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    setOpen(true)
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 100)
  }

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", verticalAlign: "middle", marginLeft: 6 }}>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
        onFocus={openNow}
        onBlur={scheduleClose}
        onClick={e => { e.preventDefault(); setOpen(v => !v) }}
        aria-label={ariaLabel}
        aria-describedby={open ? tooltipId : undefined}
        style={{
          width: size, height: size,
          borderRadius: "50%",
          background: open ? km.ink : km.line,
          color: open ? km.white : km.muted,
          border: "none",
          cursor: "help",
          fontSize: Math.round(size * 0.7),
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
          id={tooltipId}
          role="tooltip"
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            ...(placement === "above" ? { bottom: offset } : { top: offset }),
            background: km.ink,
            color: km.white,
            padding: "12px 16px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1.55,
            width: 300,
            maxWidth: "85vw",
            zIndex: 2000,
            boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
            whiteSpace: "normal",
            textAlign: "left",
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          }}
        >
          {children}
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              marginLeft: -5,
              width: 10,
              height: 10,
              background: km.ink,
              transform: "rotate(45deg)",
              ...(placement === "above" ? { bottom: -4 } : { top: -4 }),
            }}
          />
        </span>
      )}
    </span>
  )
}

/**
 * Contenu standardisé pour expliquer pourquoi recommander de saisir
 * son numéro de téléphone. Réutilisé partout où on demande le tel.
 */
export function PhoneHelpContent() {
  return (
    <>
      <strong style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
        Pourquoi recommander de renseigner votre téléphone
      </strong>
      <ul style={{ listStyle: "disc", paddingLeft: 18, margin: "0 0 8px" }}>
        <li>Être contacté ou contacter par téléphone une fois la candidature avancée (visite, bail).</li>
        <li>Activer les appels et la visio dans la messagerie KeyMatch.</li>
        <li>Recevoir les notifications urgentes (bail à signer, visite confirmée).</li>
        <li>Renforcer la confiance avec votre interlocuteur.</li>
        <li>Vérifier votre identité plus rapidement.</li>
      </ul>
      <span style={{ display: "block", fontSize: 11, opacity: 0.78, marginTop: 8 }}>
        Votre numéro reste privé. Il n&apos;est partagé qu&apos;avec les personnes avec qui vous échangez activement (visite/bail), jamais publié ou revendu.
      </span>
    </>
  )
}
