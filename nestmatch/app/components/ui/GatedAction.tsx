"use client"
import { useEffect, useId, useState, type ReactNode } from "react"
import { km, KMButton } from "./km"

/**
 * Primitive de gating UX réutilisable.
 *
 * Pattern : un élément (link, bouton, action) reste **visible** mais est
 * désactivé visuellement (opacité, curseur) quand sa condition `enabled`
 * n'est pas remplie. Au click, au lieu de déclencher l'action, on ouvre
 * un popup éditorial expliquant **pourquoi** c'est désactivé et
 * proposant éventuellement un CTA pour avancer.
 *
 * Avantages vs masquage conditionnel pur (pattern précédent du commit
 * 5f68917) :
 *  - L'utilisateur voit que la fonction existe → expectation gérée
 *  - L'utilisateur comprend ce qu'il manque pour la débloquer
 *  - On peut lui proposer une action concrète (Parcourir les annonces…)
 *
 * Usage typique :
 *
 *   <GatedAction
 *     enabled={hasCurrentHousing}
 *     disabledReason={{
 *       title: "Disponible bientôt",
 *       body: "Cette section sera active une fois que vous aurez signé un bail.",
 *       cta: { label: "Parcourir les annonces", href: "/annonces" },
 *     }}
 *   >
 *     <Link href="/mon-logement">Mon logement</Link>
 *   </GatedAction>
 */
export type GatedActionReason = {
  title: string
  body: string
  cta?: {
    label: string
    href?: string
    onClick?: () => void
  }
}

export interface GatedActionPropsExtra {
  /**
   * Si true, le wrapper desactive prend toute la largeur (display: flex,
   * width: 100%) et le cadenas est aligne a droite (marginLeft: auto).
   * Utilise dans les listes menu (drawer mobile, dropdown desktop) pour
   * eviter le wrap 2 colonnes inline. Default false (inline-flex compact).
   * Paul 2026-04-27.
   */
  block?: boolean
}

export interface GatedActionProps extends GatedActionPropsExtra {
  /** Si `true`, render children tels quels (passthrough complet). */
  enabled: boolean
  /** Contenu du popup affiché quand l'utilisateur clique sur l'action désactivée. */
  disabledReason: GatedActionReason
  /** L'élément cliquable cible (link, bouton, etc.). */
  children: ReactNode
  /**
   * Optionnel : action déclenchée quand `enabled === true` ET que l'enfant ne
   * gère pas lui-même le click (ex: bouton qui ouvre une modale parent).
   * Pour un `<Link>` ou `<a>` enfant, laisser undefined — la navigation native
   * fera le job.
   */
  onClick?: () => void
}

/** Petite icône cadenas inline pour signaler visuellement le gating. */
function LockIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export default function GatedAction({ enabled, disabledReason, children, onClick, block }: GatedActionProps) {
  const [popupOpen, setPopupOpen] = useState(false)
  const titleId = useId()
  const bodyId = useId()

  // Esc ferme le popup. Bloque le scroll body pendant ouvert pour mobile.
  useEffect(() => {
    if (!popupOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopupOpen(false)
    }
    window.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [popupOpen])

  if (enabled) {
    // Passthrough : si onClick fourni on l'attache via un wrapper neutre ;
    // sinon, render children directement (cas Link/a qui gèrent leur navigation).
    if (onClick) {
      return (
        <span
          onClick={onClick}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onClick()
            }
          }}
          style={{ display: "contents" }}
        >
          {children}
        </span>
      )
    }
    return <>{children}</>
  }

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-disabled="true"
        aria-describedby={bodyId}
        onClick={e => {
          e.preventDefault()
          e.stopPropagation()
          setPopupOpen(true)
        }}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setPopupOpen(true)
          }
        }}
        style={{
          display: block ? "flex" : "inline-flex",
          width: block ? "100%" : undefined,
          alignItems: "center",
          gap: 6,
          opacity: 0.5,
          color: "#888",
          cursor: "not-allowed",
          position: "relative",
          // Le wrapper intercepte le click de l'enfant via pointerEvents
          // none ci-dessous + capture-phase, sans casser le focus clavier.
        }}
      >
        <span style={{ pointerEvents: "none", display: block ? "block" : "inline", flex: block ? 1 : undefined, minWidth: 0 }}>
          {children}
        </span>
        <span style={{ marginLeft: block ? "auto" : undefined, paddingRight: block ? 14 : undefined, flexShrink: 0, display: "inline-flex", alignItems: "center" }}>
          <LockIcon />
        </span>
      </span>
      {popupOpen && (
        <DisabledPopup
          titleId={titleId}
          bodyId={bodyId}
          reason={disabledReason}
          onClose={() => setPopupOpen(false)}
        />
      )}
    </>
  )
}

function DisabledPopup({
  titleId,
  bodyId,
  reason,
  onClose,
}: {
  titleId: string
  bodyId: string
  reason: GatedActionReason
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(2px)",
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "km-gated-fade 200ms ease-out",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      }}
    >
      <style>{`
        @keyframes km-gated-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes km-gated-pop { from { opacity: 0; transform: scale(0.96) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: km.white,
          borderRadius: 20,
          padding: "26px 26px 22px",
          maxWidth: 380,
          width: "100%",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
          animation: "km-gated-pop 220ms cubic-bezier(0.2,0.8,0.2,1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
          <h3
            id={titleId}
            style={{
              fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 22,
              letterSpacing: "-0.4px",
              color: km.ink,
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {reason.title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: km.beige,
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontFamily: "inherit",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={km.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p id={bodyId} style={{ fontSize: 14, color: "#3f3c37", lineHeight: 1.6, margin: 0, marginBottom: reason.cta ? 22 : 0 }}>
          {reason.body}
        </p>
        {reason.cta && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            {reason.cta.href ? (
              // V5.4 — fix bouton qui glitch sur iOS : avant, <a><KMButton>...</KMButton></a>
              // donnait du HTML invalide (button dans anchor). Sur iOS Safari, le tap
              // declenchait mouseEnter sur le <button> (transform -2px + shadow), puis
              // navigation, puis mouseLeave (revert transform) → animation visible et
              // hitbox glitchy. Solution : <a> stylise comme un button KMButton, pas
              // de nested button.
              <a
                href={reason.cta.href}
                onClick={onClose}
                style={{
                  textDecoration: "none",
                  background: km.ink,
                  color: km.white,
                  borderRadius: 999,
                  padding: "12px 26px",
                  fontWeight: 700,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  display: "inline-block",
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
                }}
              >
                {reason.cta.label}
              </a>
            ) : (
              <KMButton
                size="md"
                onClick={() => {
                  reason.cta?.onClick?.()
                  onClose()
                }}
              >
                {reason.cta.label}
              </KMButton>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
