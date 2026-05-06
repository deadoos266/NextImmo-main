"use client"
import { useState } from "react"
import { useSwipeReveal } from "../../hooks/useSwipeReveal"

/**
 * V74.1 — wrapper swipe-to-delete pour 1 ligne de la sidebar conversations.
 *
 * Pattern iOS Mail :
 *  - Swipe-left → révèle un bouton "Supprimer" rouge derrière (threshold 80 px)
 *  - Tap sur le contenu (déjà swipé) → ferme le swipe (pattern iOS Mail)
 *  - Tap sur "Supprimer" → ouvre une modal confirmation puis appelle
 *    POST /api/conversations/[peer]/delete (soft-delete personnel)
 *
 * Composant standalone, prêt à être adopté dans `app/messages/page.tsx`
 * autour de chaque ligne de la liste sidebar mobile. Plan d'adoption :
 *
 *   {conversations.map(c => (
 *     <ConversationSwipeRow
 *       key={c.peerEmail}
 *       peerEmail={c.peerEmail}
 *       onDeleted={() => refreshConversations()}
 *     >
 *       <YourExistingConversationRowMarkup conversation={c} />
 *     </ConversationSwipeRow>
 *   ))}
 *
 * Le tap simple sur l'enfant continue de fonctionner (swipe ne le bloque pas
 * tant qu'il n'y a pas eu de mouvement horizontal >10px).
 */

interface Props {
  /** Email de l'autre partie (URL-encodé en interne pour la route). */
  peerEmail: string
  /** Callback après suppression réussie pour rafraîchir la sidebar. */
  onDeleted?: () => void
  /** Le markup existant de la conversation (titre, dernier message, etc.). */
  children: React.ReactNode
  /** Désactive le swipe (ex: pendant un loading). */
  disabled?: boolean
}

export default function ConversationSwipeRow({ peerEmail, onDeleted, children, disabled }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { wrapperProps, contentStyle, isOpen, close, translateX } = useSwipeReveal({
    threshold: 80,
    direction: "left",
    disabled,
  })

  async function handleConfirmDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(peerEmail)}/delete`, {
        method: "POST",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(`Suppression impossible : ${j.error || res.status}`)
        return
      }
      onDeleted?.()
      setConfirmOpen(false)
      close()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div
        {...wrapperProps}
        style={{
          position: "relative",
          overflow: "hidden",
          background: "#DC2626",
          ...wrapperProps.style,
        }}
      >
        {/* Bouton Supprimer rouge révélé par le swipe */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setConfirmOpen(true) }}
          aria-label="Supprimer cette conversation"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: 80,
            background: "#DC2626",
            color: "white",
            border: "none",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 4,
            opacity: Math.min(1, Math.abs(translateX) / 80),
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          </svg>
          Supprimer
        </button>

        {/* Contenu translaté — tap simple ferme si déjà swipé (iOS Mail). */}
        <div
          onClickCapture={(e) => {
            if (isOpen) {
              e.preventDefault()
              e.stopPropagation()
              close()
            }
          }}
          style={contentStyle}
        >
          {children}
        </div>
      </div>

      {/* Modal confirmation suppression */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmOpen(false) }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,17,17,0.55)",
            zIndex: 4100, // Z_INDEX.modal
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 20,
              maxWidth: 420,
              width: "100%",
              padding: 24,
              boxShadow: "0 24px 64px rgba(17,17,17,0.22)",
            }}
          >
            <p style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 22,
              lineHeight: 1.2,
              margin: "0 0 12px",
              color: "#111",
            }}>
              Supprimer cette conversation ?
            </p>
            <p style={{ fontSize: 14, color: "#5a5247", lineHeight: 1.55, margin: "0 0 20px" }}>
              Cette conversation disparaîtra de votre messagerie. L&apos;autre
              partie continuera à voir l&apos;historique côté elle. Vous ne
              pourrez plus accéder aux messages échangés.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                style={{
                  background: "white",
                  color: "#111",
                  border: "1px solid #EAE6DF",
                  borderRadius: 999,
                  padding: "10px 22px",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: deleting ? "wait" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                style={{
                  background: "#DC2626",
                  color: "white",
                  border: "1px solid #DC2626",
                  borderRadius: 999,
                  padding: "10px 22px",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: deleting ? "wait" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
