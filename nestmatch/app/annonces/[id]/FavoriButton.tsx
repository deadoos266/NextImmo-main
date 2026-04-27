"use client"
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { isFavori, toggleFavori } from "../../../lib/favoris"

/**
 * Bouton coeur favori — 40x40 rond, hairline + hover beige. Etat actif =
 * coeur rempli rouge.
 *
 * Owner-view (Paul 2026-04-27) : si `ownerEmail` est passe et matche la
 * session courante, le bouton est masque. Le proprio ne sauvegarde pas
 * son propre bien (no-op, juste du bruit visuel).
 */
export default function FavoriButton({ id, ownerEmail }: { id: number; ownerEmail?: string | null }) {
  const { data: session } = useSession()
  const [actif, setActif] = useState(false)

  useEffect(() => {
    setActif(isFavori(id))
  }, [id])

  // Owner sur sa propre annonce → ne pas afficher le coeur favori
  if (ownerEmail && session?.user?.email && session.user.email.toLowerCase() === ownerEmail.toLowerCase()) {
    return null
  }

  function handleClick() {
    toggleFavori(id)
    setActif(isFavori(id))
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={actif ? "Retirer de mes annonces sauvegardees" : "Sauvegarder cette annonce"}
      title={actif ? "Sauvegardé — cliquer pour retirer" : "Sauvegarder cette annonce"}
      style={{
        width: 40,
        height: 40,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: `1px solid ${actif ? "#DC2626" : "#EAE6DF"}`,
        borderRadius: "50%",
        background: actif ? "#fff1f2" : "white",
        cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif",
        color: actif ? "#DC2626" : "#111",
        transition: "background 200ms cubic-bezier(0.4, 0, 0.2, 1), border-color 200ms, transform 200ms",
        flexShrink: 0,
        WebkitTapHighlightColor: "transparent",
      }}
      onMouseEnter={e => {
        if (actif) return
        e.currentTarget.style.background = "#F7F4EF"
        e.currentTarget.style.transform = "scale(1.05)"
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = actif ? "#fff1f2" : "white"
        e.currentTarget.style.transform = "scale(1)"
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={actif ? "#DC2626" : "none"} stroke={actif ? "#DC2626" : "#111"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    </button>
  )
}
