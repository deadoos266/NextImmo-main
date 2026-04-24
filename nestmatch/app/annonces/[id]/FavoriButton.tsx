"use client"
import { useEffect, useState } from "react"
import { isFavori, toggleFavori } from "../../../lib/favoris"

export default function FavoriButton({ id }: { id: number }) {
  const [actif, setActif] = useState(false)

  useEffect(() => {
    setActif(isFavori(id))
  }, [id])

  function handleClick() {
    toggleFavori(id)
    setActif(isFavori(id))
  }

  return (
    <button
      onClick={handleClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 20px", border: `2px solid ${actif ? "#b91c1c" : "#EAE6DF"}`,
        borderRadius: 999, background: actif ? "#fff1f2" : "white",
        cursor: "pointer", fontWeight: 700, fontSize: 14,
        fontFamily: "'DM Sans', sans-serif",
        color: actif ? "#b91c1c" : "#8a8477",
        transition: "all 0.2s",
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.04)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={actif ? "#b91c1c" : "none"} stroke={actif ? "#b91c1c" : "#8a8477"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      {actif ? "Sauvegardé" : "Sauvegarder"}
    </button>
  )
}
